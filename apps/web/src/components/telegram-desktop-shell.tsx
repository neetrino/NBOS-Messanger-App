"use client";

import {
  CHAT_ATTACHMENT_INPUT_ACCEPT,
  MESSAGE_DELETED_BODY,
  type AttachmentKind,
  type MessageAttachmentDto,
} from "@app-messenger/shared";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ChatEmojiPickerPanel } from "@/components/chat-emoji-picker-panel";
import { ChatMessageAttachment } from "@/components/chat-message-attachment";
import { formatFileSize } from "@/lib/chat-attachment-client";

const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 80;
const COMPOSER_TEXTAREA_MIN_PX = 44;
const COMPOSER_TEXTAREA_MAX_PX = 168;

function syncTextareaHeightToContent(
  el: HTMLTextAreaElement,
  minPx: number,
  maxPx: number,
) {
  el.style.height = "0px";
  const next = Math.max(minPx, Math.min(maxPx, el.scrollHeight));
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
}

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

export type PendingLocalAttachment = {
  file: File;
  kind: AttachmentKind;
  previewUrl: string | null;
  name: string;
  size: number;
};

export type TelegramDesktopShellProps = {
  userEmail: string;
  userId: string;
  accountKind: "demo" | "session";
  demoPersonas?: readonly { email: string; label: string }[];
  activeDemoIndex?: number;
  onDemoIndexChange?: (index: number) => void;
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  messages: MessageRow[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  pendingAttachment: PendingLocalAttachment | null;
  onPendingAttachmentClear: () => void;
  onAttachmentFileChosen: (file: File) => void;
  composerSending: boolean;
  attachmentError: string | null;
  apiBase: string;
  getAuthHeaders: () => Record<string, string>;
  socketConnected: boolean;
  error: string | null;
  otherUserId: string;
  onOtherUserIdChange: (value: string) => void;
  onCreateConversation: () => void | Promise<void>;
  onLogout: () => void;
  onDeleteMessage: (messageId: string, mode: "for-me" | "for-everyone") => void;
};

function displayName(user: MemberUser): string {
  return user.name?.trim() || user.email.split("@")[0] || user.email;
}

function conversationLabel(c: Conversation, meId: string): string {
  if (c.title?.trim()) {
    return c.title;
  }
  const others = c.members
    .filter((m) => m.userId !== meId)
    .map((m) => displayName(m.user));
  return others.length ? others.join(", ") : "Chat";
}

function initials(label: string): string {
  const p = label.trim().slice(0, 2);
  return p.length ? p.toUpperCase() : "?";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return "Today";
  }
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

const MD_UP_MEDIA_QUERY = "(min-width: 768px)";

function subscribeMdUp(callback: () => void): () => void {
  const mq = window.matchMedia(MD_UP_MEDIA_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMdUpSnapshot(): boolean {
  return window.matchMedia(MD_UP_MEDIA_QUERY).matches;
}

function getMdUpServerSnapshot(): boolean {
  return false;
}

function useMdUp(): boolean {
  return useSyncExternalStore(subscribeMdUp, getMdUpSnapshot, getMdUpServerSnapshot);
}

export function TelegramDesktopShell({
  userEmail,
  userId,
  accountKind,
  demoPersonas,
  activeDemoIndex,
  onDemoIndexChange,
  conversations,
  activeConversationId,
  onSelectConversation,
  messages,
  draft,
  onDraftChange,
  onSend,
  pendingAttachment,
  onPendingAttachmentClear,
  onAttachmentFileChosen,
  composerSending,
  attachmentError,
  apiBase,
  getAuthHeaders,
  socketConnected,
  error,
  otherUserId,
  onOtherUserIdChange,
  onCreateConversation,
  onLogout,
  onDeleteMessage,
}: TelegramDesktopShellProps) {
  const isMdUp = useMdUp();
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [search, setSearch] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [messageContext, setMessageContext] = useState<{
    x: number;
    y: number;
    m: MessageRow;
  } | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const messageContextMenuRef = useRef<HTMLDivElement | null>(null);
  const skipMessageContextPointerDismissRef = useRef(false);
  const emojiAnchorRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const composerStripRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const userPinnedToBottomRef = useRef(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return conversations;
    }
    return conversations.filter((c) =>
      conversationLabel(c, userId).toLowerCase().includes(q),
    );
  }, [conversations, search, userId]);

  const active = conversations.find((c) => c.id === activeConversationId);
  const headerTitle = active ? conversationLabel(active, userId) : "Select a chat";

  const rowsWithSeparators = useMemo(() => {
    type Row =
      | { kind: "sep"; key: string; label: string }
      | { kind: "msg"; key: string; m: MessageRow };
    const out: Row[] = [];
    let lastDay = "";
    for (const m of messages) {
      const day = formatDayKey(m.createdAt);
      if (day !== lastDay) {
        lastDay = day;
        out.push({ kind: "sep", key: `sep-${m.id}`, label: formatDayLabel(m.createdAt) });
      }
      out.push({ kind: "msg", key: m.id, m });
    }
    return out;
  }, [messages]);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesScrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const updatePinnedFromScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const dist = scrollHeight - clientHeight - scrollTop;
    userPinnedToBottomRef.current = dist <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  const messageScrollKey = useMemo(
    () =>
      `${activeConversationId}:${messages.length}:${messages[messages.length - 1]?.id ?? ""}`,
    [activeConversationId, messages],
  );

  useLayoutEffect(() => {
    userPinnedToBottomRef.current = true;
    if (!activeConversationId) {
      return;
    }
    scrollMessagesToBottom("auto");
  }, [activeConversationId, scrollMessagesToBottom]);

  useLayoutEffect(() => {
    if (!activeConversationId) {
      return;
    }
    if (!userPinnedToBottomRef.current) {
      return;
    }
    scrollMessagesToBottom("auto");
  }, [activeConversationId, messageScrollKey, scrollMessagesToBottom]);

  /** Narrow layout: chat pane was `hidden` on the list; opening it needs a fresh scroll after layout. */
  useLayoutEffect(() => {
    if (isMdUp || mobilePane !== "chat" || !activeConversationId) {
      return;
    }
    userPinnedToBottomRef.current = true;
    const syncComposerIntoView = () => {
      scrollMessagesToBottom("auto");
      composerStripRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    };
    syncComposerIntoView();
    let outer = 0;
    let inner = 0;
    outer = window.requestAnimationFrame(() => {
      syncComposerIntoView();
      inner = window.requestAnimationFrame(() => {
        syncComposerIntoView();
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [activeConversationId, isMdUp, mobilePane, scrollMessagesToBottom]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      if (userPinnedToBottomRef.current) {
        requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeConversationId, scrollMessagesToBottom]);

  useLayoutEffect(() => {
    const el = draftInputRef.current;
    if (!el) {
      return;
    }
    syncTextareaHeightToContent(
      el,
      COMPOSER_TEXTAREA_MIN_PX,
      COMPOSER_TEXTAREA_MAX_PX,
    );
  }, [draft]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const root = menuRootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const root = emojiAnchorRef.current;
      if (root && !root.contains(e.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEmojiPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emojiPickerOpen]);

  useEffect(() => {
    setEmojiPickerOpen(false);
  }, [activeConversationId]);

  useEffect(() => {
    setMessageContext(null);
  }, [activeConversationId]);

  useLayoutEffect(() => {
    if (!pendingAttachment || !activeConversationId) {
      return;
    }
    const el = draftInputRef.current;
    if (!el || composerSending) {
      return;
    }
    el.focus();
    window.setTimeout(() => {
      draftInputRef.current?.focus();
    }, 0);
  }, [activeConversationId, composerSending, pendingAttachment]);

  useEffect(() => {
    if (!pendingAttachment || composerSending || !activeConversationId) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) {
        return;
      }
      if (draftInputRef.current === document.activeElement) {
        return;
      }
      const ae = document.activeElement;
      const focusAllowsSend =
        ae === document.body ||
        ae === document.documentElement ||
        ae === attachInputRef.current;
      if (!focusAllowsSend) {
        return;
      }
      e.preventDefault();
      userPinnedToBottomRef.current = true;
      void onSend();
      setEmojiPickerOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [
    activeConversationId,
    composerSending,
    draft,
    onSend,
    pendingAttachment,
  ]);

  useEffect(() => {
    if (isMdUp) {
      return;
    }
    if (!activeConversationId) {
      setMobilePane("list");
    }
  }, [activeConversationId, isMdUp]);

  useEffect(() => {
    if (!messageContext) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (skipMessageContextPointerDismissRef.current) {
        return;
      }
      const root = messageContextMenuRef.current;
      if (root && !root.contains(e.target as Node)) {
        setMessageContext(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [messageContext]);

  useEffect(() => {
    if (!messageContext) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMessageContext(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageContext]);

  const handleComposerSend = useCallback(() => {
    if (!draft.trim() && !pendingAttachment) {
      return;
    }
    userPinnedToBottomRef.current = true;
    void onSend();
    setEmojiPickerOpen(false);
  }, [draft, onSend, pendingAttachment]);

  const insertEmoji = useCallback(
    (emoji: string) => {
      const el = draftInputRef.current;
      const start = el?.selectionStart ?? draft.length;
      const end = el?.selectionEnd ?? draft.length;
      const next = draft.slice(0, start) + emoji + draft.slice(end);
      onDraftChange(next);
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + emoji.length;
        el?.setSelectionRange(pos, pos);
      });
    },
    [draft, onDraftChange],
  );

  const showListPane = isMdUp || mobilePane === "list";
  const showChatPane = isMdUp || mobilePane === "chat";

  return (
    <div className="flex h-[min(100dvh,900px)] w-full min-h-0 min-w-0 max-md:h-full max-md:max-h-full flex-1 flex-row overflow-hidden rounded-xl border border-[#1a2332] shadow-2xl md:h-auto md:min-h-0 md:flex-1 md:rounded-none md:border-0 md:shadow-none">
      {/* Sidebar */}
      <aside
        className={`flex min-h-0 min-w-0 flex-col overflow-x-hidden bg-[#292f3f] text-[#e4e6eb] md:w-[min(100%,340px)] md:shrink-0 ${
          showListPane ? "flex-1 md:flex-none" : "hidden md:flex"
        }`}
      >
        <div ref={menuRootRef} className="relative z-20 min-w-0 shrink-0 px-2 pt-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#a8adb7] hover:bg-[#3a3f4f] hover:text-white"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls="app-account-menu"
            >
              <span className="text-xl leading-none">☰</span>
            </button>
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6d7588]">
                🔍
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="w-full rounded-full bg-[#242f3d] py-2.5 pl-9 pr-3 text-[13px] text-[#e4e6eb] placeholder:text-[#6d7588] outline-none ring-1 ring-transparent focus:ring-[#8774e1]/50"
              />
            </div>
          </div>

          <div
            id="app-account-menu"
            role="menu"
            aria-label="Menu"
            aria-hidden={!menuOpen}
            className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              menuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={`border-t border-[#1f2430] pt-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                  menuOpen
                    ? "translate-y-0 opacity-100 motion-safe:animate-[tg-menu-reveal_0.2s_ease-out]"
                    : "pointer-events-none translate-y-[-4px] opacity-0"
                }`}
              >
                <div className="self-start w-[min(100%,260px)] rounded-[10px] border border-[#2f3f52] bg-[#222d3b] py-1 shadow-[0_8px_28px_rgba(0,0,0,0.42)]">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-[15px] font-medium text-[#eb8686] transition-colors hover:bg-white/[0.06] active:bg-white/[0.1]"
                    onClick={() => {
                      onLogout();
                      setMenuOpen(false);
                    }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-[#8b92a0]"
                      aria-hidden
                    >
                      🚪
                    </span>
                    <span>Log out</span>
                  </button>
                </div>
                <div className="h-2 shrink-0" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[#1f2430] px-3 py-2 text-[11px] text-[#6d7588]">
          Signed in as <span className="text-[#a8adb7]">{userEmail}</span>
          {accountKind === "demo" ? (
            <span className="text-[#8774e1]"> · demo</span>
          ) : null}
        </div>

        {demoPersonas && onDemoIndexChange && typeof activeDemoIndex === "number" ? (
          <div className="flex flex-wrap gap-2 border-t border-[#1f2430] px-3 py-2">
            {demoPersonas.map((u, i) => {
              const on = i === activeDemoIndex;
              return (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => onDemoIndexChange(i)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    on
                      ? "bg-[#8774e1] text-white"
                      : "bg-[#242f3d] text-[#8b92a0] hover:bg-[#343a4a]"
                  }`}
                >
                  {u.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="tg-scrollbar flex-1 min-h-0 overflow-y-auto">
          {filtered.map((c) => {
            const on = c.id === activeConversationId;
            const label = conversationLabel(c, userId);
            const subtitle =
              c.members.length > 1
                ? `${c.members.length} members`
                : "Message";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelectConversation(c.id);
                  if (!isMdUp) {
                    setMobilePane("chat");
                  }
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  on ? "bg-[#8774e1] text-white" : "hover:bg-[#343a4a]"
                }`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    on ? "bg-white/20 text-white" : "bg-[#6c8eef] text-white"
                  }`}
                >
                  {initials(label)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{label}</span>
                  <span
                    className={`block truncate text-[13px] ${on ? "text-white/80" : "text-[#8b92a0]"}`}
                  >
                    {subtitle}
                  </span>
                </span>
                <span className={`shrink-0 text-[12px] ${on ? "text-white/70" : "text-[#6d7588]"}`}>
                  {formatTime(c.createdAt)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative border-t border-[#1f2430] p-3">
          <button
            type="button"
            onClick={() => setNewConvOpen((v) => !v)}
            className="absolute bottom-5 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#8774e1] text-2xl text-white shadow-lg hover:bg-[#7667d4]"
            aria-label="New message"
          >
            ✎
          </button>
          {newConvOpen ? (
            <div className="mb-16 flex flex-col gap-2 rounded-xl bg-[#242f3d] p-3 ring-1 ring-[#8774e1]/30">
              <p className="text-[12px] font-medium text-[#a8adb7]">New conversation</p>
              <input
                value={otherUserId}
                onChange={(e) => onOtherUserIdChange(e.target.value)}
                placeholder="Other user id"
                className="rounded-lg bg-[#1a2332] px-3 py-2 text-[13px] text-white outline-none ring-1 ring-[#3a4555] focus:ring-[#8774e1]"
              />
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await onCreateConversation();
                    setNewConvOpen(false);
                    if (!isMdUp) {
                      setMobilePane("chat");
                    }
                  })();
                }}
                className="rounded-lg bg-[#8774e1] py-2 text-[13px] font-semibold text-white hover:bg-[#7667d4]"
              >
                Create
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Main chat */}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col bg-[#0e1621] ${
          showChatPane ? "flex md:flex" : "hidden md:flex"
        }`}
      >
        <header className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-[#1f2a3a] bg-[#17212b] px-3 py-2 text-[#e4e6eb] sm:gap-3 sm:px-4">
          {!isMdUp ? (
            <button
              type="button"
              onClick={() => setMobilePane("list")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#a8adb7] hover:bg-[#2b5278]/40 hover:text-white md:hidden"
              aria-label="Back to chats"
            >
              <span className="text-xl leading-none" aria-hidden>
                ←
              </span>
            </button>
          ) : null}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6c8eef] text-sm font-semibold text-white">
            {initials(headerTitle)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{headerTitle}</p>
            <p className="truncate text-[13px] text-[#6d9fd5]">
              {socketConnected ? "online" : "connecting…"} · you: {userId.slice(0, 8)}…
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[#a8adb7]">
            <button type="button" className="rounded-full p-2 hover:bg-[#2b5278]/40 hover:text-white" aria-label="Call">
              📞
            </button>
            <button type="button" className="rounded-full p-2 hover:bg-[#2b5278]/40 hover:text-white" aria-label="Search">
              🔍
            </button>
            <span
              className="rounded-full p-2 text-[#a8adb7]"
              aria-hidden="true"
            >
              ⋮
            </span>
          </div>
        </header>

        {error ? (
          <p className="shrink-0 bg-[#3d1f24] px-4 py-2 text-[13px] text-[#ff8a8a]">{error}</p>
        ) : null}

        <div
          className="tg-chat-pattern flex min-h-0 flex-1 flex-col overflow-x-hidden"
          style={{
            backgroundColor: "#0e1621",
          }}
        >
          <div
            ref={messagesScrollRef}
            onScroll={updatePinnedFromScroll}
            className="tg-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3"
          >
            {!activeConversationId ? (
              <p className="m-auto text-center text-[#6d7588]">Pick a conversation from the list</p>
            ) : (
              <div className="flex flex-col gap-1">
                {rowsWithSeparators.map((row) =>
                  row.kind === "sep" ? (
                    <div key={row.key} className="flex justify-center py-3">
                      <span className="rounded-full bg-[#1f2a3a]/90 px-3 py-1 text-[12px] text-[#8b92a0]">
                        {row.label}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={row.key}
                      className={`flex max-w-[min(100%,520px)] flex-col gap-0.5 ${
                        row.m.senderId === userId ? "self-end items-end" : "self-start items-start"
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const MENU_W = 220;
                        const MENU_H = 96;
                        const pad = 8;
                        const vw =
                          typeof window !== "undefined" ? window.innerWidth : e.clientX + MENU_W;
                        const vh =
                          typeof window !== "undefined" ? window.innerHeight : e.clientY + MENU_H;
                        const x = Math.min(
                          Math.max(pad, e.clientX),
                          Math.max(pad, vw - MENU_W - pad),
                        );
                        const y = Math.min(
                          Math.max(pad, e.clientY),
                          Math.max(pad, vh - MENU_H - pad),
                        );
                        skipMessageContextPointerDismissRef.current = true;
                        setMessageContext({ x, y, m: row.m });
                        window.setTimeout(() => {
                          skipMessageContextPointerDismissRef.current = false;
                        }, 0);
                      }}
                    >
                      {row.m.senderId !== userId ? (
                        <span className="px-1 text-[11px] text-[#8b92a0]">
                          {row.m.senderId.slice(0, 8)}…
                        </span>
                      ) : null}
                      <div
                        className={`rounded-2xl px-3 py-2 shadow-sm ${
                          row.m.senderId === userId
                            ? "rounded-br-md bg-[#8774e1] text-white"
                            : "rounded-bl-md bg-[#2b5278] text-[#e4ecf5]"
                        }`}
                      >
                        {row.m.attachment &&
                        !(row.m.deletedForEveryone || row.m.body === MESSAGE_DELETED_BODY) ? (
                          <ChatMessageAttachment
                            attachment={row.m.attachment}
                            apiBase={apiBase}
                            getAuthHeaders={getAuthHeaders}
                            mine={row.m.senderId === userId}
                          />
                        ) : null}
                        {row.m.body.trim() ||
                        row.m.deletedForEveryone ||
                        row.m.body === MESSAGE_DELETED_BODY ? (
                          <p
                            className={`whitespace-pre-wrap text-[15px] leading-snug ${
                              row.m.attachment ? "mt-2 " : ""
                            }${
                              row.m.deletedForEveryone || row.m.body === MESSAGE_DELETED_BODY
                                ? row.m.senderId === userId
                                  ? "italic text-white/85"
                                  : "italic text-[#b8c9dc]"
                                : ""
                            }`}
                          >
                            {row.m.body}
                          </p>
                        ) : null}
                        <p
                          className={`mt-1 text-right text-[11px] ${
                            row.m.senderId === userId ? "text-white/70" : "text-[#8eb4e0]"
                          }`}
                        >
                          {formatTime(row.m.createdAt)}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <div
            ref={composerStripRef}
            className="shrink-0 border-t border-[#1f2a3a] bg-[#17212b] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
          >
            {attachmentError ? (
              <p className="mb-2 text-[12px] text-[#ff8a8a]">{attachmentError}</p>
            ) : null}
            {pendingAttachment ? (
              <div className="mb-2 flex items-start gap-2 rounded-xl bg-[#242f3d] p-2 ring-1 ring-[#2a3544]">
                {pendingAttachment.previewUrl && pendingAttachment.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img
                    src={pendingAttachment.previewUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : pendingAttachment.previewUrl && pendingAttachment.kind === "video" ? (
                  <video
                    src={pendingAttachment.previewUrl}
                    className="h-14 w-20 shrink-0 rounded-lg object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-black/25 text-2xl">
                    📄
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-[#e4e6eb]">{pendingAttachment.name}</p>
                  <p className="text-[11px] text-[#8b92a0]">
                    {formatFileSize(pendingAttachment.size)}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-[#ff8a8a] hover:bg-white/[0.06]"
                  onClick={onPendingAttachmentClear}
                  aria-label="Remove attachment"
                >
                  Remove
                </button>
              </div>
            ) : null}
            <input
              ref={attachInputRef}
              type="file"
              className="sr-only"
              accept={CHAT_ATTACHMENT_INPUT_ACCEPT}
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) {
                  onAttachmentFileChosen(f);
                }
              }}
            />
            <div className="flex items-end gap-2">
              <div
                ref={emojiAnchorRef}
                className="relative flex min-h-[44px] min-w-0 flex-1 items-center rounded-3xl bg-[#242f3d] px-2 ring-1 ring-[#2a3544] focus-within:ring-[#8774e1]/40"
              >
                {emojiPickerOpen ? (
                  <div className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[min(100vw-1.5rem,18rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[#2a3544] bg-[#242f3d] shadow-2xl ring-1 ring-black/20">
                    <ChatEmojiPickerPanel onPick={insertEmoji} />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#8b92a0] transition-colors hover:bg-white/[0.06] hover:text-[#8774e1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8774e1]/55"
                  aria-label="Open emoji picker"
                  aria-expanded={emojiPickerOpen}
                  aria-haspopup="listbox"
                  onClick={() => setEmojiPickerOpen((v) => !v)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                <textarea
                  ref={draftInputRef}
                  value={draft}
                  rows={1}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) {
                      return;
                    }
                    e.preventDefault();
                    handleComposerSend();
                  }}
                  placeholder="Message"
                  disabled={!activeConversationId || composerSending}
                  className="max-h-[168px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 pr-2 text-[15px] leading-snug text-[#e4e6eb] placeholder:text-[#6d7588] outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-[#8b92a0] hover:text-[#8774e1] disabled:opacity-40"
                  aria-label="Attach file"
                  disabled={!activeConversationId || composerSending}
                  onClick={() => attachInputRef.current?.click()}
                >
                  📎
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (draft.trim() || pendingAttachment) {
                    handleComposerSend();
                  }
                }}
                disabled={
                  !activeConversationId ||
                  composerSending ||
                  (!draft.trim() && !pendingAttachment)
                }
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#8774e1] text-lg text-white shadow-md hover:bg-[#7667d4] disabled:opacity-40"
                aria-label={draft.trim() || pendingAttachment ? "Send" : "Voice message"}
              >
                {composerSending ? (
                  <span className="text-xs">…</span>
                ) : draft.trim() || pendingAttachment ? (
                  "➤"
                ) : (
                  "🎤"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {messageContext ? (
        <div
          ref={messageContextMenuRef}
          role="menu"
          aria-label="Message actions"
          className="fixed z-[80] w-[min(100vw-1rem,220px)] overflow-hidden rounded-[10px] border border-[#2f3f52] bg-[#222d3b] py-1 shadow-[0_8px_28px_rgba(0,0,0,0.42)]"
          style={{ left: messageContext.x, top: messageContext.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2.5 text-left text-[14px] text-[#ff8a8a] transition-colors hover:bg-white/[0.06]"
            onClick={() => {
              onDeleteMessage(messageContext.m.id, "for-me");
              setMessageContext(null);
            }}
          >
            Delete for me
          </button>
          {messageContext.m.senderId === userId ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2.5 text-left text-[14px] text-[#ff8a8a] transition-colors hover:bg-white/[0.06]"
              onClick={() => {
                const ok = window.confirm(
                  "This will remove the message for all participants. Continue?",
                );
                if (!ok) {
                  return;
                }
                onDeleteMessage(messageContext.m.id, "for-everyone");
                setMessageContext(null);
              }}
            >
              Delete for everyone
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
