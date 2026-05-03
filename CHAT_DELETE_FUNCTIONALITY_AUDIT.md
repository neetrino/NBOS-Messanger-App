# Chat delete functionality — codebase audit

## Mobile — where messages render

- **File:** `apps/mobile/src/messenger-root.tsx`
- **Component:** `MessengerRoot`
- **Rendering:** `FlatList` with `data={chatRows}` where `chatRows` comes from `messageRowsWithSeparators(messages)` (day separators + message rows).
- **Bubble UI:** `renderItem` renders each message in a `View` (`styles.bubbleWrap` / `styles.bubble`) with `Text` for `item.body` and timestamp (lines ~904–950).

## Web — where messages render

- **File:** `apps/web/src/components/telegram-desktop-shell.tsx`
- **Component:** `TelegramDesktopShell`
- **Rendering:** Scrollable column maps `rowsWithSeparators` (derived from `messages` prop) over day separators and message bubbles (lines ~532–570).
- **Parent:** `apps/web/src/components/messenger-client.tsx` loads history, holds `messages` state, opens Socket.IO, and passes props into `TelegramDesktopShell`.

## Message input / send logic

- **Mobile:** `apps/mobile/src/messenger-root.tsx` — `TextInput` composer, `send()` emits `SocketEvents.MESSAGE_SEND` via `socket.io-client` (`socketRef`).
- **Web:** `apps/web/src/components/messenger-client.tsx` — `sendMessage` emits `MESSAGE_SEND`; composer lives in `TelegramDesktopShell` (`textarea`, Enter without Shift sends).

## Message API / server actions

- **REST:** `GET /conversations/:id/messages` — `apps/api/src/conversations/conversations.controller.ts` → `ConversationsService.listMessages`.
- **REST (added):** `DELETE /messages/:messageId?mode=for-me|for-everyone` — `apps/api/src/messages/messages.controller.ts` (JWT), validated query `mode` via `apps/api/src/messages/dto/message-delete-query.dto.ts`.
- **Realtime:** `apps/api/src/chat/chat.gateway.ts` — `MESSAGE_SEND` persists via `MessagesService.createInConversation`, then `MESSAGE_NEW` broadcast to the conversation room. **Added:** `message:deleted-for-everyone` after a successful delete-for-everyone.

## Current message data model (Prisma)

- **File:** `apps/api/prisma/schema.prisma`
- **Model `Message` (after this work):** existing fields plus `hiddenForUserIds` (string array, default empty) for per-user hide, and `deletedForEveryoneAt` (optional `DateTime`) for global tombstone.
- **Migration:** `apps/api/prisma/migrations/20260503120000_message_delete_soft_fields/migration.sql` (ALTER TABLE only — assumes `Message` already exists; use `pnpm db:migrate` or `pnpm db:push` per your environment).

## Auth / ownership

- **REST:** `JwtAuthGuard` on `ConversationsController`; `req.userId` from JWT.
- **WebSocket:** `ChatGateway.handleConnection` verifies JWT, sets `client.data.userId`.
- **Membership:** `ConversationsService.assertMember(userId, conversationId)` before listing or sending.
- **Implicit ownership:** `senderId` on `Message` identifies the author; only the sender may delete for everyone (enforced in service layer).

## Realtime

- **Yes:** Socket.IO (`socket.io-client` on web/mobile, `@nestjs/websockets` gateway on API).
- **Events:** `conversation:join`, `conversation:leave`, `message:send`, `message:new`, `message:deleted-for-everyone` (added), `error`.
- **“Delete for me”** is not broadcast over the socket.

## Recommended delete data model

- **Delete for me:** Soft-hide per viewer using a string array on `Message`, e.g. `hiddenForUserIds` (append current user id). List queries exclude rows where the current user’s id is in that array.
- **Delete for everyone:** Soft-delete globally using `deletedForEveryoneAt` (nullable `DateTime`). When set, API returns a tombstone `body` (e.g. “This message was deleted”) and a boolean `deletedForEveryone` for clients; original text is not returned in list payloads after deletion.
- **No attachment fields** in the current schema — no storage cleanup required.

## Files to change (implementation)

| Area | Files |
|------|--------|
| Audit | `CHAT_DELETE_FUNCTIONALITY_AUDIT.md` (this file) |
| DB | `apps/api/prisma/schema.prisma`, new migration under `apps/api/prisma/migrations/` |
| Shared | `packages/shared/src/index.ts` (socket event, payload type, tombstone constant) |
| API services | `apps/api/src/messages/messages.service.ts`, `apps/api/src/conversations/conversations.service.ts` |
| API HTTP | New `apps/api/src/messages/messages.controller.ts`, DTO for `mode` query |
| API modules | `apps/api/src/messages/messages.module.ts`, `apps/api/src/chat/chat.module.ts` (forwardRef + export gateway) |
| Realtime | `apps/api/src/chat/chat.gateway.ts` (broadcast helper for delete-for-everyone) |
| Web | `apps/web/src/components/messenger-client.tsx`, `apps/web/src/components/telegram-desktop-shell.tsx` |
| Mobile | `apps/mobile/src/messenger-root.tsx` |

## Implementation steps

1. Extend Prisma `Message` with `hiddenForUserIds` and `deletedForEveryoneAt`; migrate.
2. Implement `MessagesService.deleteForMe` / `deleteForEveryone` with membership + sender checks; map list results to DTOs with tombstone + `deletedForEveryone`.
3. Add `DELETE /messages/:messageId` with validated `mode` query; after delete-for-everyone, emit new socket event with full client-safe payload.
4. Update shared package: event name, payload type, `MESSAGE_DELETED_BODY` constant.
5. **Web:** extend `MessageRow` type; fetch delete API; listen for delete-for-everyone socket; add right-click context menu on bubbles (viewport clamp, outside click, Escape).
6. **Mobile:** extend `MessageRow`; long-press on bubble → `Modal` action sheet; call delete API; optional `Alert` for delete-for-everyone confirmation.
7. Run `pnpm db:generate`, lint, typecheck, build (and migrate where applicable).

## Validation checklist (manual)

See task §12 — exercise long-press / right-click, both delete modes, API rejection for delete-for-everyone on others’ messages, menu dismiss behavior, refresh persistence, send/emoji/scroll unchanged.
