"use client";

import {
  CHAT_TYPING_PRESENCE_TTL_MS,
  DEMO_PASSWORD,
  DEMO_USERS,
  MESSAGE_DELETED_BODY,
  OutgoingTypingController,
  SocketEvents,
  formatTypingIndicatorText,
  type MessageAttachmentDto,
  type MessageDeletedForEveryonePayload,
  type MessageNewPayload,
  type MessageSendPayload,
  type TypingPresencePayload,
} from "@app-messenger/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/lib/api-base";
import { clearWebSession, readWebSession } from "@/lib/session-storage";
import {
  TelegramDesktopShell,
  type PendingLocalAttachment,
} from "@/components/telegram-desktop-shell";
import { validateBrowserFile } from "@/lib/chat-attachment-client";

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
  deletedForEveryone?: boolean;
  attachment?: MessageAttachmentDto | null;
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
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingLocalAttachment | null>(null);
  const [composerSending, setComposerSending] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [accountKind, setAccountKind] = useState<"demo" | "session">("demo");
  const [typingPeers, setTypingPeers] = useState<
    Record<string, { displayName: string }>
  >({});

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const outgoingTypingRef = useRef<OutgoingTypingController | null>(null);
  const typingExpiryTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;

  const authHeaders = useMemo(() => {
    if (!token) {
      return undefined;
    }
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!token) {
      return {};
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

  const deleteMessage = useCallback(
    async (messageId: string, mode: "for-me" | "for-everyone") => {
      if (!authHeaders) {
        return;
      }
      const res = await fetch(
        `${apiBase}/messages/${encodeURIComponent(messageId)}?mode=${encodeURIComponent(mode)}`,
        { method: "DELETE", headers: authHeaders },
      );
      if (!res.ok) {
        setError(formatApiError(res.status, await res.text()));
        return;
      }
      if (mode === "for-me") {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                body: MESSAGE_DELETED_BODY,
                deletedForEveryone: true,
                attachment: undefined,
              }
            : m,
        ),
      );
    },
    [apiBase, authHeaders],
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const clearPendingAttachment = useCallback(() => {
    setPendingAttachment((p) => {
      if (p?.previewUrl) {
        URL.revokeObjectURL(p.previewUrl);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    clearPendingAttachment();
    setAttachmentError(null);
  }, [activeConversationId, clearPendingAttachment]);

  const clearTypingExpiryTimer = useCallback((userId: string) => {
    const t = typingExpiryTimersRef.current[userId];
    if (t) {
      clearTimeout(t);
    }
    delete typingExpiryTimersRef.current[userId];
  }, []);

  const clearAllTypingExpiryTimers = useCallback(() => {
    for (const id of Object.keys(typingExpiryTimersRef.current)) {
      clearTypingExpiryTimer(id);
    }
  }, [clearTypingExpiryTimer]);

  const applyRemoteTypingPayload = useCallback(
    (payload: TypingPresencePayload) => {
      const me = userIdRef.current;
      if (!me || payload.userId === me) {
        return;
      }
      if (payload.conversationId !== activeConversationId) {
        return;
      }
      if (!payload.isTyping) {
        clearTypingExpiryTimer(payload.userId);
        setTypingPeers((prev) => {
          if (!prev[payload.userId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
        return;
      }
      clearTypingExpiryTimer(payload.userId);
      setTypingPeers((prev) => ({
        ...prev,
        [payload.userId]: { displayName: payload.userName },
      }));
      typingExpiryTimersRef.current[payload.userId] = setTimeout(() => {
        setTypingPeers((prev) => {
          if (!prev[payload.userId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
        delete typingExpiryTimersRef.current[payload.userId];
      }, CHAT_TYPING_PRESENCE_TTL_MS);
    },
    [activeConversationId, clearTypingExpiryTimer],
  );

  useEffect(() => {
    if (!token || !activeConversationId) {
      return;
    }
    const s = io(apiBase, {
      transports: ["websocket", "polling"],
      auth: { token },
    });
    setSocket(s);
    setTypingPeers({});
    clearAllTypingExpiryTimers();

    const outgoing = new OutgoingTypingController((isTyping) => {
      if (!s.connected) {
        return;
      }
      s.emit(SocketEvents.TYPING_SEND, {
        conversationId: activeConversationId,
        isTyping,
      });
    });
    outgoingTypingRef.current = outgoing;

    s.on("connect", () => {
      s.emit(SocketEvents.JOIN_CONVERSATION, {
        conversationId: activeConversationId,
      });
      outgoing.syncDraft(draftRef.current);
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
            ...(payload.attachment ? { attachment: payload.attachment } : {}),
          },
        ];
      });
    });
    s.on(
      SocketEvents.MESSAGE_DELETED_FOR_EVERYONE,
      (payload: MessageDeletedForEveryonePayload) => {
        if (payload.conversationId !== activeConversationId) {
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.id
              ? {
                  id: payload.id,
                  conversationId: payload.conversationId,
                  senderId: payload.senderId,
                  body: payload.body,
                  createdAt: payload.createdAt,
                  deletedForEveryone: true,
                  attachment: undefined,
                }
              : m,
          ),
        );
      },
    );
    s.on(SocketEvents.TYPING_UPDATE, (payload: TypingPresencePayload) => {
      applyRemoteTypingPayload(payload);
    });
    s.on("disconnect", () => {
      setTypingPeers({});
      clearAllTypingExpiryTimers();
    });
    return () => {
      outgoing.dispose();
      outgoingTypingRef.current = null;
      clearAllTypingExpiryTimers();
      setTypingPeers({});
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [
    activeConversationId,
    apiBase,
    applyRemoteTypingPayload,
    clearAllTypingExpiryTimers,
    token,
  ]);

  useEffect(() => {
    outgoingTypingRef.current?.syncDraft(draft);
  }, [draft]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document === "undefined") {
        return;
      }
      if (document.visibilityState === "hidden") {
        outgoingTypingRef.current?.flushFalse();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId],
  );

  const typingIndicatorText = useMemo(() => {
    const isDirectChat = (activeConversation?.members.length ?? 0) === 2;
    const names = Object.entries(typingPeers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v.displayName);
    return formatTypingIndicatorText({
      isDirectChat,
      typingDisplayNames: names,
    });
  }, [activeConversation?.members.length, typingPeers]);

  const onAttachmentFileChosen = useCallback((file: File) => {
    setAttachmentError(null);
    const v = validateBrowserFile(file);
    if (!v.ok) {
      setAttachmentError(v.message);
      return;
    }
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      const previewUrl =
        v.kind === "image" || v.kind === "video"
          ? URL.createObjectURL(file)
          : null;
      return {
        file,
        kind: v.kind,
        previewUrl,
        name: file.name,
        size: file.size,
      };
    });
  }, []);

  const sendMessage = useCallback(async () => {
    setError(null);
    setAttachmentError(null);
    outgoingTypingRef.current?.flushFalse();
    const text = draft.trim();
    if (!socket?.connected || !activeConversationId) {
      return;
    }
    if (!text && !pendingAttachment) {
      return;
    }
    if (composerSending) {
      return;
    }
    if (!token) {
      return;
    }
    setComposerSending(true);
    try {
      let uploaded: MessageAttachmentDto | undefined;
      if (pendingAttachment?.file) {
        const form = new FormData();
        form.append("file", pendingAttachment.file);
        const res = await fetch(
          `${apiBase}/conversations/${encodeURIComponent(activeConversationId)}/attachments`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          },
        );
        if (!res.ok) {
          const hint =
            res.status === 413
              ? "File is too large"
              : formatApiError(res.status, await res.text());
          setAttachmentError(
            hint.includes("too large") ? "File is too large" : "Upload failed. Please try again.",
          );
          return;
        }
        uploaded = (await res.json()) as MessageAttachmentDto;
      }
      const payload: MessageSendPayload = {
        conversationId: activeConversationId,
        body: text,
        ...(uploaded ? { attachment: { fileId: uploaded.fileId } } : {}),
      };
      socket.emit(SocketEvents.MESSAGE_SEND, payload);
      setDraft("");
      clearPendingAttachment();
    } finally {
      setComposerSending(false);
    }
  }, [
    activeConversationId,
    apiBase,
    clearPendingAttachment,
    composerSending,
    draft,
    pendingAttachment,
    socket,
    token,
  ]);

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
        pendingAttachment={pendingAttachment}
        onPendingAttachmentClear={clearPendingAttachment}
        onAttachmentFileChosen={onAttachmentFileChosen}
        composerSending={composerSending}
        attachmentError={attachmentError}
        apiBase={apiBase}
        getAuthHeaders={getAuthHeaders}
        socketConnected={Boolean(socket?.connected)}
        error={error}
        otherUserId={otherUserId}
        onOtherUserIdChange={setOtherUserId}
        onCreateConversation={() => void createConversation()}
        onLogout={handleLogout}
        onDeleteMessage={(messageId, mode) => void deleteMessage(messageId, mode)}
        typingIndicatorText={typingIndicatorText}
        onTypingComposerBlur={() => {
          outgoingTypingRef.current?.flushFalse();
        }}
      />
    </div>
  );
}
