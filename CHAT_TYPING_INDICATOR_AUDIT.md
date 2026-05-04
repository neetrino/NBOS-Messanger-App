# Chat typing indicator — implementation audit

## Web

| Area | Location |
|------|----------|
| Chat input (composer) | `apps/web/src/components/telegram-desktop-shell.tsx` — `<textarea>` for draft, emoji insert, Enter / Shift+Enter, attachment strip |
| Parent wiring (draft state, send, socket) | `apps/web/src/components/messenger-client.tsx` |
| Message list | `apps/web/src/components/telegram-desktop-shell.tsx` — scrollable column with `rowsWithSeparators` (day separators + bubbles) |

## Mobile

| Area | Location |
|------|----------|
| Chat input | `apps/mobile/src/messenger-root.tsx` — `TextInput` (`draftInputRef`), multiline, `blurOnSubmit={false}`, send via round button |
| Message list | `apps/mobile/src/messenger-root.tsx` — `FlatList` with `messageRowsWithSeparators` |
| Auth gate (not chat) | `apps/mobile/src/auth-gate.tsx` |

## Realtime / transport

- **Mechanism:** Socket.IO (`socket.io` on NestJS API, `socket.io-client` on web and mobile).
- **Auth:** JWT in `handshake.auth.token` (or Bearer header).
- **Rooms:** `conversation:${conversationId}` — join via `SocketEvents.JOIN_CONVERSATION`, leave via `SocketEvents.LEAVE_CONVERSATION`.
- **Existing events:** `message:send` / `message:new`, `message:deleted-for-everyone`, `error`.

## Direct vs group chat (data model)

- **Model:** `Conversation` with `members[]` (each has `userId` + nested `user` with `id`, `email`, `name`).
- **Direct chat:** exactly **two** members (`members.length === 2`).
- **Group chat:** more than two members (including titled groups created with multiple member IDs via API).

## Participant display names

- **Web shell:** `displayName(user)` — `user.name?.trim() || user.email.split("@")[0] || user.email` (`telegram-desktop-shell.tsx`).
- **Mobile:** same pattern in `messenger-root.tsx` as `displayName(user)`.
- **Typing broadcast:** server resolves label from DB (`User.name`, `email` local-part fallback) so clients cannot spoof `userName`.

## Proposed typing event shape

**Client → server** (`typing:send`):

```ts
{ conversationId: string; isTyping: boolean }
```

**Server → room** (`typing:update`, broadcast to conversation room excluding sender):

```ts
{
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  timestamp: string; // ISO
}
```

Typing is **not** persisted; it is ephemeral presence only.

## Timeout / debounce strategy (centralized in `@app-messenger/shared`)

| Constant | Role |
|----------|------|
| `CHAT_TYPING_PRESENCE_TTL_MS` (4000) | If no `typing:update` refresh for a remote user, client removes their typing row |
| `CHAT_TYPING_EMIT_MIN_INTERVAL_MS` (2200) | Outgoing `typing:send` with `isTyping: true` is throttled while the draft stays non-empty; heartbeat interval matches this |
| `CHAT_TYPING_LOCAL_STOP_DEBOUNCE_MS` (400) | Debounce before emitting `isTyping: false` when the draft becomes empty |

**Outgoing controller:** `OutgoingTypingController` in shared — start typing → immediate `true`; while non-empty → interval refresh; empty → debounced `false`; `flushFalse()` on send, blur, conversation change, dispose.

**Incoming:** each `typing:update` with `isTyping: true` resets a per-`userId` TTL timer; `isTyping: false` clears immediately.

## Files changed (implemented)

- `packages/shared/src/index.ts` — exports typing helpers, payloads, socket event names, controller
- `packages/shared/src/chat-typing.ts` — constants, types, `formatTypingIndicatorText`, `resolveTypingDisplayName`
- `packages/shared/src/outgoing-typing-controller.ts` — `OutgoingTypingController`
- `packages/shared/tsconfig.json` — `lib` includes `DOM` for timer typings
- `apps/api/src/chat/dto/typing-send.dto.ts` — validated inbound DTO
- `apps/api/src/chat/chat.gateway.ts` — `typing:send` handler, broadcast `typing:update`
- `apps/api/src/chat/chat.module.ts` — import `PrismaModule`
- `apps/web/src/components/messenger-client.tsx` — socket listener, typing state, controller, pass props, visibility flush
- `apps/web/src/components/telegram-desktop-shell.tsx` — indicator row, blur, scroll key
- `apps/mobile/src/messenger-root.tsx` — same behavior + `AppState` inactive flush + stack leave flush
- `CHAT_TYPING_INDICATOR_AUDIT.md` — this document

## Implementation steps

1. Add shared constants, DTO types, `formatTypingIndicatorText`, `resolveTypingDisplayName`, `OutgoingTypingController`, and new `SocketEvents` entries.
2. API: validate membership, load `userName` from DB, `client.to(room).emit` (exclude sender).
3. Web: receive `typing:update`, maintain peer map + TTL; wire outgoing controller to draft / send / blur / socket lifecycle; render subtle line above composer; extend scroll key when indicator text changes.
4. Mobile: mirror web logic; place indicator between `FlatList` and composer; `AppState` → `flushFalse` when not `active`; keep `KeyboardAvoidingView` layout.

## Limitations

- None for realtime: full Socket.IO broadcast with membership checks. If the API is unreachable, typing indicators simply do not update until the socket reconnects.
