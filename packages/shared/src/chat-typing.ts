/**
 * Ephemeral chat typing — timing rules shared by web and mobile clients.
 */

/** Hide a remote user's typing row if no typing payload refresh before this elapses */
export const CHAT_TYPING_PRESENCE_TTL_MS = 4000;

/** Minimum spacing between outgoing typing:true while the draft stays non-empty */
export const CHAT_TYPING_EMIT_MIN_INTERVAL_MS = 2200;

/** Debounce before emitting typing:false when the draft becomes empty */
export const CHAT_TYPING_LOCAL_STOP_DEBOUNCE_MS = 400;

/** Client → server (Socket.IO) */
export type TypingSendPayload = {
  conversationId: string;
  isTyping: boolean;
};

/** Server → clients in the conversation room (excludes sender) */
export type TypingPresencePayload = {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  timestamp: string;
};

export type TypingProfileLike = {
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
};

/**
 * Fallback order: displayName → name → username → email local-part / full → "Someone"
 */
export function resolveTypingDisplayName(profile: TypingProfileLike): string {
  const d = profile.displayName?.trim();
  if (d) {
    return d;
  }
  const n = profile.name?.trim();
  if (n) {
    return n;
  }
  const u = profile.username?.trim();
  if (u) {
    return u;
  }
  const e = profile.email?.trim();
  if (e) {
    const at = e.indexOf("@");
    return at > 0 ? e.slice(0, at) : e;
  }
  return "Someone";
}

/**
 * `typingDisplayNames` must already exclude the current user and reflect one name per typing peer.
 * Sort names before calling for stable copy in group chats.
 */
export function formatTypingIndicatorText(input: {
  isDirectChat: boolean;
  typingDisplayNames: readonly string[];
}): string | null {
  const names = [...input.typingDisplayNames]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort((a, b) => a.localeCompare(b));

  if (names.length === 0) {
    return null;
  }

  if (input.isDirectChat) {
    return "typing...";
  }

  if (names.length === 1) {
    return `${names[0]} is typing...`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing...`;
  }
  if (names.length === 3) {
    return `${names[0]}, ${names[1]} and ${names[2]} are typing...`;
  }
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} others are typing...`;
}
