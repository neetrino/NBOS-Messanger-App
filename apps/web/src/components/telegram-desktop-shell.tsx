"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Conversation = { id: string; title: string | null; createdAt: string };

type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type TelegramDesktopShellProps = {
  userEmail: string;
  userId: string;
  accountKind: "demo" | "session";
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  messages: MessageRow[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  socketConnected: boolean;
  error: string | null;
  otherUserId: string;
  onOtherUserIdChange: (value: string) => void;
  onCreateConversation: () => void;
  onLogout: () => void;
};

function convLabel(c: Conversation): string {
  return c.title?.trim() || c.id.slice(0, 8);
}

function initials(label: string): string {
  const p = label.trim().slice(0, 2);
  return p.length ? p.toUpperCase() : "?";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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

export function TelegramDesktopShell({
  userEmail,
  userId,
  accountKind,
  conversations,
  activeConversationId,
  onSelectConversation,
  messages,
  draft,
  onDraftChange,
  onSend,
  socketConnected,
  error,
  otherUserId,
  onOtherUserIdChange,
  onCreateConversation,
  onLogout,
}: TelegramDesktopShellProps) {
  const [search, setSearch] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return conversations;
    }
    return conversations.filter((c) => convLabel(c).toLowerCase().includes(q));
  }, [conversations, search]);

  const active = conversations.find((c) => c.id === activeConversationId);
  const headerTitle = active ? convLabel(active) : "Select a chat";

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

  return (
    <div className="flex h-[min(100dvh,900px)] w-full max-w-[1200px] mx-auto rounded-xl overflow-hidden shadow-2xl border border-[#1a2332]">
      {/* Sidebar */}
      <aside className="flex w-[min(100%,340px)] shrink-0 flex-col bg-[#292f3f] text-[#e4e6eb] min-w-0 overflow-x-hidden">
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

        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.map((c) => {
            const on = c.id === activeConversationId;
            const label = convLabel(c);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConversation(c.id)}
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
                    Chat · {c.id.slice(0, 6)}…
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
                  onCreateConversation();
                  setNewConvOpen(false);
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
      <div className="flex min-w-0 flex-1 flex-col bg-[#0e1621]">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#1f2a3a] bg-[#17212b] px-4 py-2 text-[#e4e6eb]">
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
          className="tg-chat-pattern flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{
            backgroundColor: "#0e1621",
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
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
                        <p className="whitespace-pre-wrap text-[15px] leading-snug">{row.m.body}</p>
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

          <div className="shrink-0 border-t border-[#1f2a3a] bg-[#17212b] px-3 py-2">
            <div className="flex items-end gap-2">
              <div className="relative flex min-h-[44px] min-w-0 flex-1 items-center rounded-3xl bg-[#242f3d] px-2 ring-1 ring-[#2a3544] focus-within:ring-[#8774e1]/40">
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-[#8b92a0] hover:text-[#8774e1]"
                  aria-label="Emoji"
                >
                  🙂
                </button>
                <input
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Message"
                  disabled={!activeConversationId}
                  className="min-h-[44px] flex-1 bg-transparent py-2.5 pr-2 text-[15px] text-[#e4e6eb] placeholder:text-[#6d7588] outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-[#8b92a0] hover:text-[#8774e1]"
                  aria-label="Attach"
                >
                  📎
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (draft.trim()) {
                    onSend();
                  }
                }}
                disabled={!activeConversationId}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#8774e1] text-lg text-white shadow-md hover:bg-[#7667d4] disabled:opacity-40"
                aria-label={draft.trim() ? "Send" : "Voice message"}
              >
                {draft.trim() ? "➤" : "🎤"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
