# Chat attachments — implementation audit

## Paperclip icon locations

| App | File | Notes |
|-----|------|-------|
| Web | `apps/web/src/components/telegram-desktop-shell.tsx` | Composer strip, `aria-label="Attach"` (updated to `Attach file`), emoji-style 📎 before send |
| Mobile | `apps/mobile/src/messenger-root.tsx` | Composer row, `Pressable` with 📎 glyph (no handler before this work) |

## Current chat message model (before)

- **Prisma** `Message`: `id`, `conversationId`, `senderId`, `body` (string), `createdAt`, `hiddenForUserIds`, `deletedForEveryoneAt`
- No attachment fields; no file storage tables

## Current send message flow

1. **Web** (`MessengerClient`): `socket.emit(SocketEvents.MESSAGE_SEND, { conversationId, body })` after `draft.trim()` non-empty
2. **Mobile** (`MessengerRoot`): same, gated on `draft.trim()`
3. **API** (`ChatGateway.onMessageSend`): validates `MessageSendDto`, calls `MessagesService.createInConversation`, broadcasts `MESSAGE_NEW`

## Storage / upload system (before)

- None. No multer/S3/local upload routes.

## Mobile vs web shared logic

- **Shared**: `@app-messenger/shared` socket event names and payload types; attachment MIME/size rules and DTO shape
- **Not shared**: UI (Telegram shell vs RN styles), file picking (`<input type="file">` vs `expo-document-picker`), authenticated media loading (web uses `fetch` + blob URLs; RN `Image`/`Video` `headers`)

## Schema / API changes (implemented)

1. **Prisma**
   - `Message.attachment` — optional `Json` (denormalized `{ fileId, kind, originalName, mimeType, size }` for list/history)
   - `ChatFile` — pending upload row: `id`, `conversationId`, `uploadedByUserId`, `storageFileName`, `originalName`, `mimeType`, `sizeBytes`, `kind`, `messageId` (nullable, unique when set)
2. **REST**
   - `POST /conversations/:conversationId/attachments` — multipart `file`, JWT, membership check, MIME magic-byte + size validation, writes disk, creates `ChatFile`
   - `GET /files/:fileId` — JWT, membership via `ChatFile.conversationId`
3. **Socket**
   - `MessageSendDto`: optional `attachment: { fileId }`; body may be empty when attachment present; class-level validator ensures text and/or attachment
   - `MessageNewPayload` / history DTO: optional `attachment`

## Chosen attachment data model

- **On message (JSON)**: `MessageAttachmentDto` — `fileId`, `kind` (`image` \| `video` \| `file`), `originalName`, `mimeType`, `size`
- **On disk**: `apps/api/uploads/chat/{storageFileName}` (`storageFileName` = `${cuid()}.${safeExt}`)
- **Binding**: after successful `Message` create, `ChatFile.messageId` set in one transaction

## Files changed / added

- `CHAT_ATTACHMENTS_AUDIT.md` (this file)
- `packages/shared/src/attachments.ts`, `packages/shared/src/index.ts`
- `apps/api/prisma/schema.prisma`, new migration SQL
- `apps/api/src/chat-files/*` (module, service, controller)
- `apps/api/src/app.module.ts`, `apps/api/package.json` (`multer`, `file-type`)
- `apps/api/src/messages/messages.service.ts`, `apps/api/src/chat/chat.gateway.ts`, `apps/api/src/chat/dto/message-send.dto.ts`
- `apps/api/src/conversations/conversations.service.ts` (DTO mapping)
- `apps/web/src/components/telegram-desktop-shell.tsx`, `messenger-client.tsx`
- `apps/mobile/package.json`, `apps/mobile/src/messenger-root.tsx`

## Implementation steps

1. Add shared attachment rules + types
2. Prisma migrate: `attachment` on `Message`, `ChatFile` model
3. Implement upload + download with validation; bind file in `MessagesService`
4. Extend gateway + DTOs + conversation message mapping
5. Web: hidden file input, preview strip, send/upload flow, bubble rendering, blob fetch for protected files
6. Mobile: `expo-document-picker`, FormData upload, preview, send, RN Image/Video with auth headers
7. Run lint / typecheck / build

## Limitations (documented)

- **Orphan `ChatFile`**: if upload succeeds and the user never sends (or leaves the chat), the row and disk file remain until a future cleanup job. Message creation failure after upload start is prevented by binding only inside the DB transaction after validation.
- **Delete for everyone**: message becomes tombstone; files are not deleted from disk (no prior retention policy).
- **Thumbnails**: not generated; images/videos use full file or inline video where supported.
- **Mobile downloads**: use `expo-file-system/legacy` (`createDownloadResumable`) plus `expo-sharing` for “Download / open”; videos in-thread use the same file card as documents to avoid loading very large files into memory for inline playback.

## Checks run (2026-05-03)

- `pnpm build` (repo root: shared, api, web) — **passed**
- `pnpm exec tsc --noEmit -p apps/mobile` — **passed**
- `pnpm run lint` in `apps/web` — **passed**
- `pnpm run lint` in `apps/api` — **fails** on existing `@typescript-eslint/no-unsafe-*` issues in `chat.gateway.ts` (socket client typing) and auth DTOs; not introduced solely by attachments.
- **Database**: apply migration with `pnpm db:migrate` (or `pnpm prisma:migrate` from api) when deploying; new migration folder `20260503140000_chat_attachments`.
- **API tests (`pnpm --filter @app-messenger/api test`)**: not run in this session.
