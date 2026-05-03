# Mobile / Web Parity Audit

Date: 2026-05-03  
Scope: `apps/mobile/`, `apps/web/`

## 1. Structure — `apps/mobile/`

| Path | Role |
|------|------|
| `App.tsx` | Root: `StatusBar` + `MessengerRoot` |
| `index.ts` | Expo entry |
| `app.config.ts`, `app.json`, `metro.config.ts` | Expo / Metro config |
| `src/auth-gate.tsx` | Register / sign-in gate + demo entry |
| `src/messenger-root.tsx` | Chats list, chat thread, sockets, demo/JWT sessions |
| `src/api-base.ts` | API base URL resolution |
| `src/demo-users.ts` | Demo accounts (to be consolidated with shared package) |

No separate i18n layer; all UI strings are inline.

## 2. Structure — `apps/web/`

| Path | Role |
|------|------|
| `src/app/page.tsx` | Home: hosts `MessengerClient` |
| `src/app/layout.tsx`, `globals.css` | Layout, CSS variables, Telegram-style chat background |
| `src/app/login/page.tsx`, `register/page.tsx` | JWT sign-in / sign-up (English) |
| `src/components/messenger-client.tsx` | Session vs demo, API + socket wiring |
| `src/components/telegram-desktop-shell.tsx` | Desktop-style two-pane UI |
| `src/lib/api-base.ts`, `session-storage.ts` | API URL, persisted JWT session |

No i18n library; strings are inline in components.

## 3. Where UI text lives

- **Mobile:** `src/auth-gate.tsx`, `src/messenger-root.tsx` (Armenian found only here).
- **Web:** `telegram-desktop-shell.tsx`, `messenger-client.tsx`, `login/page.tsx`, `register/page.tsx` (already English).

## 4. Theme / design tokens

- **Mobile:** Local `TG` objects in `auth-gate.tsx` and `messenger-root.tsx` (hex palette aligned with Telegram-style dark UI).
- **Web:** Tailwind arbitrary hex values in components + `:root` in `globals.css` (`--background`, `--foreground`).
- **Shared:** `packages/shared` — socket event names and message payload types only (no theme package).

## 5. Shared code

- `@app-messenger/shared`: `SocketEvents`, `MessageNewPayload`, `MessageSendPayload`.

## 6. Armenian texts found (before fix)

| Location | Text (summary) |
|----------|------------------|
| `auth-gate.tsx` | Password mismatch / min length, generic error, titles, tabs, field labels, placeholders, busy/register/login buttons, subtitle, demo button |
| `messenger-root.tsx` | API unreachable multi-line hint (mixed hy/en), loading, seed hint, log out menu, empty chat list |

Web: **none** (Unicode Armenian scan).

## 7. Design inconsistencies (pre-change)

| Area | Mobile | Web |
|------|--------|-----|
| Auth screen | Full `#0e1621` | Outer `#0b121a`, card `#0e1621` + border |
| Chat header bg | `#212d3b` | `#17212b` |
| Search placeholder color | `TG.muted` | `#6d7588` (similar intent) |
| List row active state | No row highlight for selected conv | Selected row uses accent fill |
| Composer / pattern | Solid bg | `tg-chat-pattern` subtle gradients |

Plan: Align auth outer background and card treatment on mobile with web; align mobile chat header background to `#17212b`; add selected-conversation styling on mobile list rows.

## 8. Functionality differences (pre-change)

| Feature | Mobile | Web |
|---------|--------|-----|
| Auth | In-app register + sign-in + demo | Home uses demo or stored session; `/login`, `/register` separate |
| Demo users | Alice, Bob, Caro switcher | Alice only |
| New conversation | Not in UI | Sidebar FAB: other user id + Create |
| `GET …/messages` | `take=80` | Default (50) |
| Conversation list data | Full `members` + labels from participants | Typed as `{ id, title, createdAt }` only; labels from title or id slice |
| Demo login errors | Detailed local-network hints (Armenian) | Short `formatApiError` only |
| After create conversation | N/A | Did not select newly created chat |

## 9. Implementation plan

1. Add `DEMO_USERS` / `DEMO_PASSWORD` to `@app-messenger/shared`; mobile re-exports or imports; web uses same list + persona switcher when in demo mode.
2. Replace all Armenian strings in mobile with English matching web copy (`Sign in`, `Create account`, `Please wait…`, validation messages, etc.).
3. English network-hint block for mobile demo boot errors.
4. Mobile: “New conversation” sheet (user id + Create), same API as web; on success refresh list and open new chat.
5. Web: Extend conversation type to match API (`members`, `createdAt`); label rows like mobile; `take=80` on history; `formatDemoLoginError` for fetch failures; set active conversation after create; optional `tg-chat-pattern` usage consistency (already on web).
6. Mobile visual tweaks: auth layout, header color, selected chat row.
7. Build shared; run web `lint` + `build`; run mobile `tsc --noEmit` if available.

## 10. Files to be modified

- `packages/shared/src/index.ts`, new `packages/shared/src/demo-users.ts`
- `apps/mobile/src/demo-users.ts`, `apps/mobile/src/auth-gate.tsx`, `apps/mobile/src/messenger-root.tsx`, `apps/mobile/App.tsx`
- `apps/web/src/components/messenger-client.tsx`, `apps/web/src/components/telegram-desktop-shell.tsx`

---

## 11. Implementation status (2026-05-03)

### Armenian → English

- All Unicode Armenian UI strings were in `apps/mobile/src/auth-gate.tsx` and `apps/mobile/src/messenger-root.tsx`; both files are now English and aligned with web wording (`Sign in`, `Create account`, `Please wait…`, `Passwords do not match.`, `Log out`, etc.).
- Re-scan: no Armenian script matches under `apps/mobile/` or `apps/web/`.

### Terminology / shared constants

- `DEMO_PASSWORD` and `DEMO_USERS` live in `packages/shared/src/demo-users.ts` and are exported from `@app-messenger/shared`.
- `apps/mobile/src/demo-users.ts` re-exports from shared.
- Web `messenger-client.tsx` imports the same demo list for Alice / Bob / Caro.

### Design alignment

- **Mobile auth:** Outer `#0b121a`, centered card `#0e1621` with border — mirrors web login/register shells.
- **Mobile chat header:** `#17212b` to match web chat header.
- **Mobile chat list:** Selected row uses accent background and inverted text (same idea as web sidebar selection).
- **Mobile conversation rows:** Show `formatMsgTime(createdAt)` like web; subtitle `N members` / `Message` like web.

### Functionality alignment

- **Web:** Demo persona chips (Alice / Bob / Caro) with re-login on switch; `GET …/messages?take=80`; dedupe on `MESSAGE_NEW`; `formatDemoLoginError` for unreachable API; after `POST /conversations`, selects the new conversation id; conversation list uses API `members` for titles and subtitles.
- **Mobile:** “New conversation” modal (other user id + Create / Cancel) + FAB; same create API as web; `StatusBar` style `light` on dark UI.
- **Web app router:** `login/page.tsx` and `register/page.tsx` use a non-exported page component + `export default` only, satisfying Next.js typed route validation (fixes `next build`).

### Files touched

- `PROJECT_AUDIT_MOBILE_WEB_PARITY.md` (this file)
- `packages/shared/src/index.ts`, `packages/shared/src/demo-users.ts` (new)
- `apps/mobile/App.tsx`, `apps/mobile/src/auth-gate.tsx`, `apps/mobile/src/messenger-root.tsx`, `apps/mobile/src/demo-users.ts`
- `apps/web/src/components/messenger-client.tsx`, `apps/web/src/components/telegram-desktop-shell.tsx`
- `apps/web/src/app/login/page.tsx`, `apps/web/src/app/register/page.tsx`

### Checks run

| Check | Result |
|--------|--------|
| `pnpm --filter @app-messenger/shared build` | OK |
| `pnpm --filter @app-messenger/web lint` | OK |
| `pnpm --filter @app-messenger/web build` / `pnpm run build` | OK |
| `pnpm exec tsc -p apps/mobile --noEmit` | OK |

### Not run / N/A

- **`apps/mobile`:** No `lint`, `build`, or `test` scripts in `package.json` — only Expo `start` / platform targets.
- **Automated E2E:** No test suite invoked.

### Manual review suggested

- **Create conversation:** Requires a valid **other user’s id** (cuid from DB). UX is minimal by design; confirm copy (“Other user id”) is clear enough for your users.
- **Web demo switch:** Clears session and re-fetches; brief “Signing in…” flash is expected.
- **Optional:** Extract shared `TG` palette to `packages/shared` if you want a single token source for RN + web.
