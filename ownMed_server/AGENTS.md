OwnMed backend API — Express 5 + TypeScript on Neon PostgreSQL.

## Commands

```bash
npm run dev        # tsx watch — hot reload
npm run build      # tsc -> dist/
npm start          # node dist/index.js (run `npm run build` first)
npm run typecheck  # tsc --noEmit
```

There is no test runner wired up yet.

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

## Not built yet

Remaining work: the domain routes (health profiles, medicines, prescriptions, family members), and finishing the app-side auth loop (token auto-refresh is still mock in `ownMed`). The Expo app currently calls `/auth/register`, `/auth/login`, `/auth/password-reset/*`, and `/auth/logout`; it does not yet call `/auth/refresh`.
