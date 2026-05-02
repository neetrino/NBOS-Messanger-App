"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

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

  const menuOverlay =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
            role="presentation"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="w-full max-w-[360px] rounded-2xl border border-[#2a3544] bg-[#17212b] p-5 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-menu-title"
              onClick={(e) => e.stopPropagation()}
            >
              <p
                id="app-menu-title"
                className="text-[12px] font-bold uppercase tracking-wide text-[#6d7588]"
              >
                Մենյու
              </p>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#6c8eef] text-sm font-semibold text-white">
                  {initials(userEmail)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[#e4e6eb]">{userEmail}</p>
                  <p className="mt-1 text-[12px] font-semibold text-[#8774e1]">
                    {accountKind === "demo" ? "Դեմո ռեժիմ" : "Հաշիվ"}
                  </p>
                </div>
              </div>
              <div className="my-5 h-px bg-[#2a3544]" />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="w-full rounded-xl bg-[#3d1f24] py-3 text-[15px] font-semibold text-[#ff8a8a] hover:bg-[#4a252c]"
                  onClick={() => {
                    onLogout();
                    setMenuOpen(false);
                  }}
                >
                  Դուրս գալ
                </button>
                <p className="text-center text-[12px] text-[#6d7588]">
                  <a className="text-[#6d9fd5] hover:underline" href="/login">
                    Մուտք
                  </a>
                  <span className="text-[#4a5568]"> · </span>
                  <a className="text-[#6d9fd5] hover:underline" href="/register">
                    Գրանցում
                  </a>
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex h-[min(100dvh,900px)] w-full max-w-[1200px] mx-auto rounded-xl overflow-hidden shadow-2xl border border-[#1a2332]">
      {menuOverlay}

      {/* Sidebar */}
      <aside className="flex w-[min(100%,340px)] shrink-0 flex-col bg-[#292f3f] text-[#e4e6eb] min-w-0">
        <div className="flex items-center gap-2 px-2 py-2.5">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#a8adb7] hover:bg-[#3a3f4f] hover:text-white"
            aria-label="Menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
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

        <div className="border-t border-[#1f2430] px-3 py-2 text-[11px] text-[#6d7588]">
          Signed in as <span className="text-[#a8adb7]">{userEmail}</span>
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
