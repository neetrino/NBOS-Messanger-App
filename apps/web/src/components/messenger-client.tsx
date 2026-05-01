"use client";

import {
  SocketEvents,
  type MessageNewPayload,
  type MessageSendPayload,
} from "@app-messenger/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/lib/api-base";

function formatApiError(status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      message?: string | string[];
    };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join("\n");
    }
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    // not JSON
  }
  const trimmed = bodyText.trim();
  return trimmed.length > 0 ? trimmed : `Request failed (${status})`;
}

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

type Conversation = { id: string; title: string | null; createdAt: string };

const DEMO_EMAIL = "alice@demo.local";
const DEMO_PASSWORD = "demo1234";

type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export function MessengerClient() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [otherUserId, setOtherUserId] = useState("");
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);

  const authHeaders = useMemo(() => {
    if (!token) {
      return undefined;
    }
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const loginDemo = useCallback(async () => {
    setError(null);
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
    if (!res.ok) {
      setError(formatApiError(res.status, await res.text()));
      return;
    }
    const data = (await res.json()) as {
      accessToken: string;
      user: AuthUser;
    };
    setToken(data.accessToken);
    setUser(data.user);
  }, [apiBase]);

  useEffect(() => {
    void loginDemo();
  }, [loginDemo]);

  const refreshConversations = useCallback(async () => {
    if (!authHeaders) {
      return;
    }
    const res = await fetch(`${apiBase}/conversations`, { headers: authHeaders });
    if (!res.ok) {
      return;
    }
    setConversations((await res.json()) as Conversation[]);
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (conversations.length === 0 || activeConversationId) {
      return;
    }
    setActiveConversationId(conversations[0].id);
  }, [conversations, activeConversationId]);

  const createConversation = useCallback(async () => {
    if (!authHeaders || !otherUserId.trim()) {
      return;
    }
    setError(null);
    const res = await fetch(`${apiBase}/conversations`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: [otherUserId.trim()] }),
    });
    if (!res.ok) {
      setError(formatApiError(res.status, await res.text()));
      return;
    }
    await refreshConversations();
  }, [apiBase, authHeaders, otherUserId, refreshConversations]);

  const loadHistory = useCallback(async () => {
    if (!authHeaders || !activeConversationId) {
      return;
    }
    const res = await fetch(
      `${apiBase}/conversations/${activeConversationId}/messages`,
      { headers: authHeaders },
    );
    if (!res.ok) {
      return;
    }
    const rows = (await res.json()) as MessageRow[];
    setMessages(rows);
  }, [activeConversationId, apiBase, authHeaders]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!token || !activeConversationId) {
      return;
    }
    const s = io(apiBase, {
      transports: ["websocket", "polling"],
      auth: { token },
    });
    setSocket(s);
    s.on("connect", () => {
      s.emit(SocketEvents.JOIN_CONVERSATION, {
        conversationId: activeConversationId,
      });
    });
    s.on(SocketEvents.MESSAGE_NEW, (payload: MessageNewPayload) => {
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id,
          conversationId: payload.conversationId,
          senderId: payload.senderId,
          body: payload.body,
          createdAt: payload.createdAt,
        },
      ]);
    });
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [activeConversationId, apiBase, token]);

  const sendMessage = useCallback(() => {
    if (!socket?.connected || !activeConversationId || !draft.trim()) {
      return;
    }
    const payload: MessageSendPayload = {
      conversationId: activeConversationId,
      body: draft.trim(),
    };
    socket.emit(SocketEvents.MESSAGE_SEND, payload);
    setDraft("");
  }, [activeConversationId, draft, socket]);

  return (
    <div className="flex flex-col gap-6 text-sm">
      {error ? (
        <p className="text-red-600 whitespace-pre-wrap">{error}</p>
      ) : null}

      {!user ? (
        <p className="text-neutral-600">Signing in as demo user…</p>
      ) : (
        <>
          <p>
            Signed in as <strong>{user.email}</strong> (id:{" "}
            <code className="text-xs">{user.id}</code>)
          </p>
          <section className="flex flex-col gap-2 max-w-md">
            <p className="font-medium">New conversation</p>
            <input
              className="border rounded px-2 py-1"
              placeholder="Other user id"
              value={otherUserId}
              onChange={(e) => setOtherUserId(e.target.value)}
            />
            <button
              type="button"
              className="border rounded px-3 py-1 w-fit"
              onClick={() => void createConversation()}
            >
              Create
            </button>
          </section>
          <section className="flex flex-col gap-2">
            <p className="font-medium">Conversations</p>
            <ul className="list-disc pl-5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setActiveConversationId(c.id)}
                  >
                    {c.title ?? c.id}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {activeConversationId ? (
            <section className="flex flex-col gap-2 border rounded p-3">
              <p className="font-medium">Active: {activeConversationId}</p>
              <p className="text-neutral-500 text-xs">
                Socket: {socket?.connected ? "connected" : "…"}
              </p>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto border rounded p-2 bg-neutral-50">
                {messages.map((m) => (
                  <div key={m.id} className="text-xs">
                    <span className="text-neutral-500">{m.senderId.slice(0, 8)}…</span>
                    : {m.body}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="border rounded px-2 py-1 flex-1"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      sendMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  className="border rounded px-3 py-1"
                  onClick={sendMessage}
                >
                  Send
                </button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
