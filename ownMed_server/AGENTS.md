OwnMed backend API — Express 5 + TypeScript on Neon PostgreSQL.

## Commands

```bash
npm run dev        # tsx watch — hot reload
npm run build      # tsc -> dist/
npm start          # node dist/index.js (run `npm run build` first)
npm run typecheck  # tsc --noEmit
```

There is no test runner wired up yet. Changes are verified against a running server instead: start `npm run dev` and drive the real routes with `fetch` from a throwaway `.mjs` script in a temp directory — register a throwaway account, push through `/sync`, and assert on the response. This is worth doing for any schema or validation change, because the API's failure mode is quiet: the sync payload validates as a whole, so one malformed row 400s an entire push rather than that one row. Beware that this writes rows owned by the throwaway account into whatever database `DATABASE_URL` points at, and there is no delete path.

## Layout

- `src/index.ts` — process entry. Starts the HTTP server and handles `SIGINT`/`SIGTERM` (closes the server, then the pool).
- `src/app.ts` — the Express app: middleware → routes → `notFound` → `errorHandler`. Import `app` from here rather than building a second one.
- `src/config/env.ts` — the **only** module that reads `process.env`. Exports a frozen `env`.
- `src/db/pool.ts` — the shared `pg` `Pool`.
- `src/db/schema.ts` — Drizzle table definitions (`users`, `refreshTokens`, `passwordResetTokens`) + inferred types.
- `src/db/index.ts` — the Drizzle client over `pool`; re-exports `schema` and its types.
- `src/routes/*.ts` — one `Router` per resource, mounted in `app.ts`.
- `src/middleware/` — `notFound`, `errorHandler`, `auth` (`authenticate`).
- `src/utils/` — `ApiError`, `asyncHandler`, `validate` (zod), `password` (bcrypt), `tokens` (JWT + refresh + reset codes), `email` (Resend).
- `src/types/express.d.ts` — augments Express `Request` with `req.user`.
- `drizzle.config.ts` — drizzle-kit config; migrations live in `drizzle/`.

## ESM with NodeNext — relative imports need `.js`

`package.json` sets `"type": "module"` and tsconfig uses `module: NodeNext`. Relative imports must carry a `.js` extension even though the source file is `.ts`:

```ts
import { env } from "../config/env.js";  // correct
import { env } from "../config/env";     // compiles, then fails at runtime
```

## Environment

All config lives in `.env` (gitignored); `.env.example` documents every key. `src/config/env.ts` throws at startup if a required variable is missing, so a bad deploy fails loudly rather than 500-ing later.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `NODE_ENV` | `development` | `production` hides stack traces |
| `DATABASE_URL` | — | **required**; Neon pooled connection string |
| `DATABASE_SSL` | `true` | Set `false` only for a local non-TLS Postgres |
| `JWT_SECRET` | — | **required**; access-token signing key |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | access-token lifetime |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `30` | refresh-token lifetime |
| `RESEND_API_KEY` | `""` | Resend API key; empty disables password-reset emails |
| `RESEND_FROM` | `OwnMed <onboarding@resend.dev>` | verified sender address for reset emails |

## Error handling

Throw `ApiError` from handlers; anything else is treated as an unexpected bug.

```ts
import { ApiError } from "../utils/ApiError.js";

throw ApiError.notFound("Medicine not found");
```

Wrap async handlers in `asyncHandler` so rejections reach the error middleware (Express 5 does this natively; the wrapper keeps it explicit).

`middleware/errorHandler.ts` is the single place error responses are shaped: it uses `ApiError.statusCode`, logs only 5xx, and replaces the message with a generic `Internal server error` for non-`ApiError` throws so internals never leak. Stack traces appear only outside production. Register it last — after `notFound` — or it will not catch anything.

## Database

`pool` connects lazily, so importing it never blocks startup and the process boots even when Neon is unreachable. `/health` reports the real connection state (`"connected"` / `"disconnected"`) instead of the server crashing — keep that property when adding checks.

Always use parameterized queries; never interpolate values into SQL:

```ts
const { rows } = await pool.query("select * from medicines where user_id = $1", [
  userId,
]);
```

## Neon gotchas

Use the **pooled** connection string (Neon dashboard → Connection Details → *Pooled connection*; the host contains `-pooler`).

The database name goes in the **path**, before the `?`:

```
correct: postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/ownmed?sslmode=require
wrong:   postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require/ownmed
```

The wrong form **does not error**. `pg` parses the path as `neondb` and silently absorbs the trailing `/ownmed` into a query-param value, so you connect successfully — to the wrong database. Always print `current_database()` when a connection looks suspicious.

`channel_binding=require` (present in Neon's default string) is ignored by node-postgres, which does not implement SCRAM channel binding. It is harmless but pointless here — leave it off unless you switch drivers.

## Authentication

The ORM decision is settled: **Drizzle** (`drizzle-orm/node-postgres`) over the existing `pg` `Pool`, migrated with `drizzle-kit`. Commands: `npm run db:generate`, `npm run db:migrate`, `npm run db:studio`.

Routes live under `/auth`:

- `POST /auth/register` — `{ name, email, password, phone? }` → `{ user, accessToken, refreshToken }` (409 on duplicate email).
- `POST /auth/login` — `{ email, password }` → same shape; 401 on bad creds.
- `POST /auth/refresh` — `{ refreshToken }` → rotates the refresh token, returns a new pair.
- `POST /auth/logout` — `{ refreshToken }` → revokes it, returns 204 (idempotent).
- `GET /auth/me` — authenticated; returns the current user.
- `POST /auth/password-reset/request` — `{ email }` → emails a 6-digit code via Resend; always returns a generic 200 to avoid email enumeration.
- `POST /auth/password-reset/confirm` — `{ email, code, newPassword }` → verifies the code, sets the new password.

Token model (refresh rotation):

- **Access token** — short-lived JWT (`JWT_SECRET`, default 15m), stateless; `authenticate` verifies signature + expiry only (no DB hit) and sets `req.user = { id, email }`.
- **Refresh token** — opaque 48-byte random string, stored only as a sha256 hash in `refresh_tokens`; rotating deletes the old row and inserts a new one, so reuse after rotation fails.
- Passwords are hashed with bcryptjs (12 rounds); emails are normalized (trim + lowercase) before storage/lookup.

## Sync (`/sync`)

Both routes require `authenticate` and operate on `req.user!.id`:

- `GET /sync` — the account's state: `{ healthProfile, medicines, familyMembers }`.
- `POST /sync` — accepts a partial snapshot, merges it, and returns the **merged** state, so the client can adopt the response wholesale instead of tracking what changed.

The merge is **add-only and idempotent**. Ids are client-generated UUIDs, so `POST`-ing the same payload twice must not duplicate rows — medicines and family members use `.onConflictDoNothing()` (which also means an id already owned by another user is silently skipped, never reassigned), and `health_profiles` has a unique index on `user_id` so a returning account's profile is never clobbered by an anonymous device.

A medicine is `{ id, name, dosage, times, days, startedOn, endedOn }` — two independent schedule axes plus a date range:

- `times` — `text[]` of 24h `"HH:mm"` strings, 0–24 entries matching `^([01]\d|2[0-3]):[0-5]\d$`. **Frequency is not a column** — the client derives it as `times.length`, so the two cannot drift. Returned sorted.
- `days` — `integer[]` of weekdays (`Date.getDay()` values, 0=Sun..6=Sat), 1–7 entries each 0–6, column default `'{0,1,2,3,4,5,6}'`. Returned sorted ascending.
- `startedOn` / `endedOn` — `"YYYY-MM-DD"` calendar-date strings, not timestamps (they are dates, so an instant type would only add timezone conversion). Stored **NULL** when unknown; `""` on the wire. A blank `endedOn` means the course is ongoing, which is the normal case, not a missing value.

Note `times` allows an **empty** array on purpose. The client's form requires at least one time, but that is a UX rule, not a data invariant: rows written before the schedule model existed have none, and the server already returns such rows. A `min(1)` here let the server hold a state it refused to accept back — and because the payload is validated as a whole, one schedule-less medicine failed the *entire* sync. Keep the write path at least as permissive as the read path.

`days`, `startedOn` and `endedOn` are **optional with defaults**, unlike `times`. An already-installed client sends `{ id, name, dosage, times }` with none of them; requiring them would 400 that device's whole sync for the same reason above. They default to all-7 days and `""`, and the insert maps the blank dates to `null`.

Dates go through `calendarDateSchema`, which checks the shape *and* that the day exists — the regex alone accepts `2026-02-30`, so the value is round-tripped through `Date` in UTC and must come back unchanged. The blank case is handled by `optionalCalendarDateSchema`, a union with `z.literal("")`: `.default("")` only covers an *absent* key, so an explicit `""` — which is exactly what the client sends for "no end date" — would otherwise fail the regex and take the whole payload down with it.

The `frequency`/`time` columns it replaced were dropped in migrations `0005` and `0006`; because drizzle-kit cannot tell an added column from a rename without a TTY, the drop and the add were generated as two separate migrations rather than one interactive pass. `days` and `started_on` arrived in `0007`, and `ended_on` in `0008` — both plain column adds, so they generated non-interactively.

There are no per-resource CRUD routes and **no delete path** — a record removed on the device will reappear from the server on the next sync. Adding deletes means adding tombstones or a real `DELETE` route, not just filtering the client array.

## Not built yet

Remaining work: per-resource CRUD (health profiles, medicines, prescriptions, family members) and file storage — the spec's Cloudflare R2 layer is not implemented, so prescription images never leave the device. On the app side, token auto-refresh is still missing: the Expo app calls `/auth/register`, `/auth/login`, `/auth/password-reset/*`, `/auth/logout`, and `/sync`, but never `/auth/refresh`.
