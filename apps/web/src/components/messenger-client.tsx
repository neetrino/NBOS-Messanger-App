"use client";

import {
  DEMO_PASSWORD,
  DEMO_USERS,
  SocketEvents,
  type MessageNewPayload,
  type MessageSendPayload,
} from "@app-messenger/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/lib/api-base";
import { clearWebSession, readWebSession } from "@/lib/session-storage";
import { TelegramDesktopShell } from "@/components/telegram-desktop-shell";

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

function isUnreachableNetworkError(message: string): boolean {
  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Network request failed") ||
    message.includes("Load failed")
  );
}

function formatDemoLoginError(e: unknown, apiBase: string): string {
  const base = e instanceof Error ? e.message : "Login failed";
  if (!isUnreachableNetworkError(base)) {
    return base;
  }
  return [
    base,
    "",
    `This browser cannot reach the API (${apiBase}).`,
    "• Ensure the API is running (repo root: `pnpm dev` or `pnpm dev:api`)",
    "• Set `NEXT_PUBLIC_API_URL` in apps/web/.env.local to the API origin",
  ].join("\n");
}

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

type MemberUser = { id: string; email: string; name: string | null };

type Conversation = {
  id: string;
  title: string | null;
  createdAt: string;
  members: Array<{ userId: string; user: MemberUser }>;
};

type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export function MessengerClient() {
  const router = useRouter();
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [otherUserId, setOtherUserId] = useState("");
  const [activeConversationId, setActiveConversationId] = useState("");
  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [accountKind, setAccountKind] = useState<"demo" | "session">("demo");

  const authHeaders = useMemo(() => {
    if (!token) {
      return undefined;
    }
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const loginDemo = useCallback(async () => {
    setError(null);
    setToken(null);
    setUser(null);
    const email = DEMO_USERS[activeDemoIndex]?.email ?? DEMO_USERS[0].email;
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: DEMO_PASSWORD }),
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
    } catch (e) {
      setError(formatDemoLoginError(e, apiBase));
    }
  }, [activeDemoIndex, apiBase]);

  useEffect(() => {
    const stored = readWebSession();
    if (stored) {
      setToken(stored.token);
      setUser(stored.user);
      setAccountKind("session");
      return;
    }
    setAccountKind("demo");
  }, []);

  useEffect(() => {
    if (accountKind !== "demo") {
      return;
    }
    void loginDemo();
  }, [accountKind, loginDemo]);

  const handleLogout = useCallback(() => {
    clearWebSession();
    router.replace("/login");
  }, [router]);

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
    const created = (await res.json()) as { id: string };
    await refreshConversations();
    setActiveConversationId(created.id);
  }, [apiBase, authHeaders, otherUserId, refreshConversations]);

  const loadHistory = useCallback(async () => {
    if (!authHeaders || !activeConversationId) {
      return;
    }
    const res = await fetch(
      `${apiBase}/conversations/${activeConversationId}/messages?take=80`,
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
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            id: payload.id,
            conversationId: payload.conversationId,
            senderId: payload.senderId,
            body: payload.body,
            createdAt: payload.createdAt,
          },
        ];
      });
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

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-[#8b92a0]">
        <p className="text-[15px]">Signing in…</p>
        {error ? (
          <p className="max-w-md whitespace-pre-wrap text-center text-[13px] text-[#ff8a8a]">
            {error}
          </p>
        ) : null}
        <p className="text-center text-[13px]">
          <a className="text-[#6d9fd5] hover:underline" href="/register">
            Create account
          </a>
          <span className="text-[#5c6370]"> · </span>
          <a className="text-[#6d9fd5] hover:underline" href="/login">
            Sign in
          </a>
        </p>
      </div>
    );
  }

  return (
    <TelegramDesktopShell
      userEmail={user.email}
      userId={user.id}
      accountKind={accountKind}
      demoPersonas={accountKind === "demo" ? DEMO_USERS : undefined}
      activeDemoIndex={accountKind === "demo" ? activeDemoIndex : undefined}
      onDemoIndexChange={accountKind === "demo" ? setActiveDemoIndex : undefined}
      conversations={conversations}
      activeConversationId={activeConversationId}
      onSelectConversation={setActiveConversationId}
      messages={messages}
      draft={draft}
      onDraftChange={setDraft}
      onSend={sendMessage}
      socketConnected={Boolean(socket?.connected)}
      error={error}
      otherUserId={otherUserId}
      onOtherUserIdChange={setOtherUserId}
      onCreateConversation={() => void createConversation()}
      onLogout={handleLogout}
    />
  );
}
