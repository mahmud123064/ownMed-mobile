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
- `src/db/schema.ts` — Drizzle table definitions + inferred types: the auth tables (`users`, `refreshTokens`, `passwordResetTokens`) and the domain tables (`healthProfiles`, `medicines`, `familyMembers`).
- `src/db/index.ts` — the Drizzle client over `pool`; re-exports `schema` and its types.
- `src/routes/*.ts` — one `Router` per resource, mounted in `app.ts`.
- `src/middleware/` — `notFound`, `errorHandler`, `auth` (`authenticate`).
- `src/utils/` — `ApiError`, `asyncHandler`, `validate` (zod), `password` (bcrypt), `tokens` (JWT + refresh + reset codes), `email` (Resend), `shareId` (Family ID generation + normalization).
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

- `POST /auth/register` — `{ name, email, password, phone? }` → `{ user, accessToken, refreshToken }` (409 on duplicate email). Also assigns the account's Family ID.
- `POST /auth/login` — `{ email, password }` → same shape; 401 on bad creds.
- `POST /auth/refresh` — `{ refreshToken }` → rotates the refresh token, returns a new pair.
- `POST /auth/logout` — `{ refreshToken }` → revokes it, returns 204 (idempotent).
- `GET /auth/me` — authenticated; returns the current user.
- `PATCH /auth/me` — authenticated; accepts `{ name?, phone?, gender?, bloodGroup?, dateOfBirth? }` and returns `{ user }`. Email is deliberately **not** accepted: changing it is an identity change that needs re-verification, not a profile edit.
- `POST /auth/password-reset/request` — `{ email }` → emails a 6-digit code via Resend; always returns a generic 200 to avoid email enumeration.
- `POST /auth/password-reset/confirm` — `{ email, code, newPassword }` → verifies the code, sets the new password.

`toPublicUser` is the single serializer for a user; it returns `id`, `name`, `email`, `phone`, `shareId`, `gender`, `bloodGroup`, `dateOfBirth`, with every nullable column flattened to `""` rather than `null` so the app's string-typed `UserProfile` needs no null handling.

**An absent key in `PATCH /auth/me` means "leave alone", which is why `dateOfBirth` does *not* use `optionalCalendarDateSchema`.** That schema is `.optional().default("")`, so a request that never mentioned the field would come back with the date wiped. The route uses `z.union([calendarDateSchema, z.literal("")]).optional()` instead, and each field is copied into the update only when `!== undefined`. A `""` the client *does* send is a real answer (an unset blood group) and is stored as `null`.

Token model (refresh rotation):

- **Access token** — short-lived JWT (`JWT_SECRET`, default 15m), stateless; `authenticate` verifies signature + expiry only (no DB hit) and sets `req.user = { id, email }`.
- **Refresh token** — opaque 48-byte random string, stored only as a sha256 hash in `refresh_tokens`; rotating deletes the old row and inserts a new one, so reuse after rotation fails.
- Passwords are hashed with bcryptjs (12 rounds); emails are normalized (trim + lowercase) before storage/lookup.

## Sync (`/sync`)

Both routes require `authenticate` and operate on `req.user!.id`:

- `GET /sync` — the account's state: `{ healthProfile, medicines, familyMembers }`.
- `POST /sync` — accepts a partial snapshot, merges it, and returns the **merged** state, so the client can adopt the response wholesale instead of tracking what changed.

The merge is **add-only and idempotent**. Ids are client-generated UUIDs, so `POST`-ing the same payload twice must not duplicate rows — medicines and family members use `.onConflictDoNothing()` (which also means an id already owned by another user is silently skipped, never reassigned), and `health_profiles` has a unique index on `user_id` so a returning account's profile is never clobbered by an anonymous device.

A medicine is `{ id, name, dosage, times, days, startedOn, endedOn, doctorName, specialty, mealTiming }` — two independent schedule axes, a date range, who prescribed it, and when to take it:

- `times` — `text[]` of 24h `"HH:mm"` strings, 0–24 entries matching `^([01]\d|2[0-3]):[0-5]\d$`. **Frequency is not a column** — the client derives it as `times.length`, so the two cannot drift. Returned sorted.
- `days` — `integer[]` of weekdays (`Date.getDay()` values, 0=Sun..6=Sat), 1–7 entries each 0–6, column default `'{0,1,2,3,4,5,6}'`. Returned sorted ascending.
- `startedOn` / `endedOn` — `"YYYY-MM-DD"` calendar-date strings, not timestamps (they are dates, so an instant type would only add timezone conversion). Stored **NULL** when unknown; `""` on the wire. A blank `endedOn` means the course is ongoing, which is the normal case, not a missing value.
- `doctorName` / `specialty` — who prescribed it and their field, both nullable and `""` on the wire. Optional **by nature**: an over-the-counter medicine has no prescriber, so a required doctor would make those impossible to record. Nothing is derived from them; the client groups Medicine History by `doctorName`.
- `mealTiming` — `"before" | "after" | ""`, before or after food. Nullable and `""` on the wire for the same reason: many medicines have no meal relation. This is the one field the schema constrains by value rather than just by type — `z.enum(["before", "after", ""])`, and `toMedicine` maps anything else back to `""` — because the column is plain `text`, so without it a bad value would reach the client and be echoed straight back into a rejected payload.

Note `times` allows an **empty** array on purpose. The client's form requires at least one time, but that is a UX rule, not a data invariant: rows written before the schedule model existed have none, and the server already returns such rows. A `min(1)` here let the server hold a state it refused to accept back — and because the payload is validated as a whole, one schedule-less medicine failed the *entire* sync. Keep the write path at least as permissive as the read path.

`days`, `startedOn`, `endedOn`, `doctorName`, `specialty` and `mealTiming` are all **optional with defaults**, unlike `times`. An already-installed client sends `{ id, name, dosage, times }` with none of them; requiring them would 400 that device's whole sync for the same reason above. They default to all-7 days and `""`, and the insert maps the blank values to `null`. This is what lets each new field ship without a coordinated client release — a device on the previous build keeps syncing, and its medicines simply read back with the new field blank.

Dates go through `calendarDateSchema`, which checks the shape *and* that the day exists — the regex alone accepts `2026-02-30`, so the value is round-tripped through `Date` in UTC and must come back unchanged. The blank case is handled by `optionalCalendarDateSchema`, a union with `z.literal("")`: `.default("")` only covers an *absent* key, so an explicit `""` — which is exactly what the client sends for "no end date" — would otherwise fail the regex and take the whole payload down with it.

The `frequency`/`time` columns it replaced were dropped in migrations `0005` and `0006`; because drizzle-kit cannot tell an added column from a rename without a TTY, the drop and the add were generated as two separate migrations rather than one interactive pass. `days` and `started_on` arrived in `0007`, and `ended_on` in `0008` — both plain column adds, so they generated non-interactively. `doctor_name`/`specialty` came in `0009`, `0010` added the Family ID and the Profile identity fields (see below), and `meal_timing` in `0011` — a plain nullable add, with no backfill, since a blank meal timing is the correct value for every row that predates it.

### Shared with `/family`

`routes/sync.ts` exports the pieces both it and `routes/family.ts` need, so the two surfaces cannot drift:

- `domainWriteSchema` — the writable domain payload (`{ medicines?, familyMembers? }`). `syncSchema` is this `.extend`ed with the health profile; the family routes take it as-is, which is what keeps the owner's health profile out of `/family/*` by construction rather than by remembering to strip it.
- `domainSnapshot(userId)` — the domain half of a snapshot (medicines + family members, no health profile). `/sync` composes it with the profile query.
- `mergeDomain(userId, input)` — the add-only insert pass, plus the `startedOn`/`endedOn`/`doctorName`/`specialty`/`mealTiming` blank-to-`null` and `age ?? null` mappings.
- `medicineSchema`, `familyMemberSchema`, `calendarDateSchema`, `optionalCalendarDateSchema` — the validators behind the above.

There are no per-resource CRUD routes and **no delete path** — a record removed on the device will reappear from the server on the next sync. Adding deletes means adding tombstones or a real `DELETE` route, not just filtering the client array.

## Family ID (`/family`)

`users.share_id` is an 8-character uppercase code from an unambiguous alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `I`, `L`, `O`, `0`, `1`, so a code read aloud or off a screenshot can't be mistyped into a different valid one). `src/utils/shareId.ts` owns `generateShareId`, `normalizeShareId` (trim + uppercase), and `generateUniqueShareId`, which retries against the database and is what `POST /auth/register` calls. The `users_share_id_unique` index is the real guarantee; the retry loop is the courtesy.

Routes — **all unauthenticated, and that is the design, not an oversight**:

- `POST /family/connect` — `{ shareId }` → `{ shareId, name }`, 404 if no account has that code. Separate from the data read so the client can confirm "Connect to Salma?" and so a mistyped code fails before any state changes.
- `GET /family/:shareId` — the linked account's `{ medicines, familyMembers }`.
- `POST /family/:shareId` — same payload and same add-only `mergeDomain` as `/sync`, returning the merged snapshot.

**The Family ID is a bearer credential.** The requirement is that a relative who has just installed the app — with no account of their own — can type in a code and start recording medicines for whoever shared it; requiring `authenticate` would defeat exactly that. So anyone who learns a code gets read and append access to that account's medicines and family members. Three things bound it: the merge is add-only (`onConflictDoNothing` — no update, no delete, so the worst case is spurious rows rather than lost or altered ones), an id already owned by a third account is skipped rather than reassigned, and the owner's `health_profiles` row is never in scope. A future "these routes are unauthenticated" finding is a product decision to raise, not a bug to patch — the agreed hardening path is invite/accept with signed tokens plus rate-limiting the `connect` lookup, never simply bolting `authenticate` on.

Migration `0010` adds the column as **nullable**, backfills existing rows with a `DO $$ ... $$` plpgsql loop, and only then creates the unique index. The nullable add is forced: `ADD COLUMN ... NOT NULL` with no default fails outright on a non-empty table, so the constraint arrives as a unique index instead. The hand-edited backfill sits between the two, giving each codeless row an 8-character code from the same misread-resistant alphabet the app generates from and re-rolling until the candidate matches no row already assigned — so the `CREATE INDEX` that follows cannot fail on a clash. The index would have tolerated repeated `NULL`s anyway; the backfill is there because an account with no code could never be shared, not because the index demands a value.

## Not built yet

Remaining work: per-resource CRUD (health profiles, medicines, prescriptions, family members) and file storage — the spec's Cloudflare R2 layer is not implemented, so prescription images never leave the device. There is also **no update or delete path** for a medicine, which is why `recoverFromLocal` on the client has to repair blank schedules locally: the server has no way to be told. Prescription *reading* is stubbed on the client (`src/lib/prescription.ts` throws) and has no server side at all.

Token auto-refresh is still missing: the Expo app calls `/auth/register`, `/auth/login`, `/auth/password-reset/*`, `/auth/logout`, `/auth/me`, `PATCH /auth/me`, `/sync` and `/family/*`, but never `/auth/refresh`.

On `/family`, the known follow-up is hardening rather than features: rate-limit the `connect` lookup and move to invite/accept with signed tokens. Until then the 8-character code is the whole credential.
