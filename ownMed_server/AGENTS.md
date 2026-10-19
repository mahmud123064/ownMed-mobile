OwnMed backend API — Express 5 + TypeScript on Neon PostgreSQL.

## Commands

```bash
npm run dev        # tsx watch — hot reload
npm run build      # tsc -> dist/
npm start          # node dist/index.js (run `npm run build` first)
npm run typecheck  # source + tests, no emit
npm test           # vitest run — integration suite against Postgres
npm run test:watch # vitest in watch mode
```

The suite is in `test/`, one file per Phase 9 area: `auth`, `api`, `database`, `reports` (file upload), `multiple-files`, `authorization`, `sync` (guest synchronization) and `account-deletion`. It drives the real Express `app` through supertest — no second app, no mocked database — because the API's failure mode is quiet: the sync payload validates as a whole, so one malformed row 400s an entire push rather than that one row.

`test/setup.ts` runs before each file and sets `NODE_ENV=test` and `TRUST_PROXY=true` before `src/config/env.ts` freezes them at import (that is why it must be a setup file, not a `beforeAll`). Trusting one proxy hop plus a unique `X-Forwarded-For` per test in `test/helpers.ts` gives every test its own rate-limit bucket; tests that exercise a limiter deliberately share one address. Rate-limit stores are in-memory and per test file, so a file cannot spend another's budget.

The target is `TEST_DATABASE_URL`, falling back to `DATABASE_URL`. Either way the suites only create `*@ownmed.test` accounts, every child table cascades from `users`, and `afterAll` deletes them again — including after a failure, and a crashed run is cleaned up at the start of the next. Object deletion in R2 is mocked in the report and account-deletion suites so no bucket request is made. Password-reset email is mocked too, which is also how the confirm tests obtain the code.

There is no Docker or local Postgres here, so the database must be reachable and migrated (`npm run db:migrate`) — `setup.ts` fails with that instruction rather than letting every test fail on a missing table. `NODE_ENV=production` is refused outright.

## Layout

- `src/index.ts` — process entry. Starts the HTTP server and handles `SIGINT`/`SIGTERM` (closes the server, then the pool).
- `src/app.ts` — the Express app: middleware → routes → `notFound` → `errorHandler`. Import `app` from here rather than building a second one. Also where CORS (`env.corsOrigins` in production, permissive otherwise), Helmet, the `1mb` JSON body cap, and `trust proxy` are set.
- `src/config/env.ts` — the **only** module that reads `process.env`. Exports a frozen `env`.
- `src/db/pool.ts` — the shared `pg` `Pool`.
- `src/db/schema.ts` — Drizzle table definitions + inferred types: the auth tables (`users`, `refreshTokens`, `passwordResetTokens`), the domain tables (`healthProfiles`, `medicines`, `familyMembers`) and `reports` (metadata for files held in R2).
- `src/db/index.ts` — the Drizzle client over `pool`; re-exports `schema` and its types.
- `src/routes/*.ts` — one `Router` per resource, mounted in `app.ts`.
- `src/middleware/` — `notFound`, `errorHandler`, `auth` (`authenticate`).
- `src/utils/` — `ApiError`, `asyncHandler`, `validate` (zod), `password` (bcrypt), `tokens` (JWT + refresh + reset codes), `email` (Resend), `r2` (presigned upload/download URLs for reports), `shareId` (Family ID generation + normalization), `rateLimit` (the named limiters).
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
| `R2_ENDPOINT` | `""` | R2 S3 API endpoint, `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | `""` | R2 API token with Object Read & Write on the bucket |
| `R2_SECRET_ACCESS_KEY` | `""` | |
| `R2_BUCKET` | `""` | |
| `R2_PUBLIC_URL` | `""` | optional custom domain / CDN in front of the bucket. Set, downloads are plain URLs; empty, the bucket stays private and downloads are presigned. |
| `LATEST_APP_VERSION` | `""` | newest released app version, served by `GET /app/version`. Empty announces no update and the app shows no notice. |
| `STORE_URL` | `""` | where an update notice points the user. May be empty while there is no store listing; the notice then has nothing to tap. |
| `CORS_ORIGINS` | `""` | comma-separated allowlist of browser origins, used in `production` only. Empty denies cross-origin browser access; native requests send no `Origin` and are unaffected either way. |
| `TRUST_PROXY` | `false` | set `true` behind a reverse proxy so rate limiting sees the real client IP instead of the proxy's. Off by default: trusting `X-Forwarded-For` unconditionally lets a client forge its own IP and slip every bucket. |

`RESEND_*` and `R2_*` are the two **optional groups**: the server boots without either, and only the routes that need them fail, with a clean 503 rather than a crash. `env.r2Configured` is the derived boolean — true only when all four of the first `R2_*` keys are non-empty, so a half-filled config is treated as none rather than booting an S3 client that fails on first upload. Both are built lazily for the same reason (`utils/email.ts`, `utils/r2.ts`): constructing `new Resend("")` or an S3 client with empty credentials throws at module load, which would take the whole process down before the key was ever read.

## Error handling

Throw `ApiError` from handlers; anything else is treated as an unexpected bug.

```ts
import { ApiError } from "../utils/ApiError.js";

throw ApiError.notFound("Medicine not found");
```

Wrap async handlers in `asyncHandler` so rejections reach the error middleware (Express 5 does this natively; the wrapper keeps it explicit).

`middleware/errorHandler.ts` is the single place error responses are shaped: it uses `ApiError.statusCode`, logs only 5xx, and replaces the message with a generic `Internal server error` for non-`ApiError` throws so internals never leak. Stack traces appear only outside production. Register it last — after `notFound` — or it will not catch anything.

## Rate limiting

`src/utils/rateLimit.ts` builds the named limiters from one local `createLimiter` helper: `loginLimiter` (10 / 15 min), `changePasswordLimiter` (10 / 15 min, its own instance so a burst of password changes cannot spend the login budget), `registerLimiter` (5 / hour), `passwordResetRequestLimiter` (5 / 15 min), `passwordResetConfirmLimiter` (10 / 15 min), `connectLimiter` (20 / 15 min, on `POST /family/connect`), `familyReadLimiter` (120 / 15 min, on `GET /family/:shareId`) and `familyWriteLimiter` (100 / 15 min, on `POST /family/:shareId`). All return the same `{ error: { message, statusCode: 429 } }` shape `errorHandler` produces, so a throttled client sees one error format rather than two.

By default only **failures** count against a bucket (`skipSuccessfulRequests`), because the surfaces above mostly carry legitimate traffic — a user signing in, asking for a reset code, connecting a family member — and charging for it would lock out normal use long before it inconvenienced an attacker, who by definition fails. `familyWriteLimiter` is the exception and passes `skipSuccessful: false`: the threat there is not guessing but a holder spamming appends into an account that is not theirs, and those requests succeed every time. A blocked request does not reset the count either way, so a determined guesser still runs out.

The store is in-memory and therefore **per-process**: correct for a single instance, and silently under-counting behind a load balancer, where each replica keeps its own buckets. A shared store (Redis) is the fix if this ever runs on more than one process. Behind a reverse proxy the limiter would otherwise see the proxy's IP for every client — set `TRUST_PROXY=true` so it reads the real one.

## Security

**Production must terminate TLS at the proxy and set `TRUST_PROXY=true`.** HTTPS itself is the proxy's job; the app's half is Helmet (`helmet({ contentSecurityPolicy: false })` in `app.ts`), which sends HSTS and the rest of the standard header set. CSP is off deliberately — every response is JSON, so there is no document for a policy to govern.

The rest of the posture, in one place so a later audit can check it rather than re-derive it:

- **Input validation** — every body and path param goes through a zod schema via `utils/validate.ts`; malformed input 400s with the first issue's message. The JSON body is capped at 1mb.
- **CORS** — `CORS_ORIGINS` is an allowlist in production and wide open in development. Native clients send no `Origin`, so they are unaffected either way; an empty production allowlist denies cross-origin browser access rather than allowing it.
- **User-level authorization** — `/sync` and `PATCH /auth/me` operate on `req.user!.id`; reports go through `ownedReport`, which 404s rather than 403s so ids cannot be probed. `/family/*` is unauthenticated **by product decision** (see "Family ID") and is bounded by the limiters above, add-only merges, and the exclusion of the owner's health profile — not by bolting on `authenticate`.
- **Private file access** — the R2 bucket is private; downloads are short-lived presigned GETs, and `R2_PUBLIC_URL` is an explicit opt-in. `POST /reports` refuses any key outside the caller's `reports/<userId>/` prefix, then HEADs the object (`utils/r2.ts` → `headObject`) so a row cannot record a file that was never uploaded, and enforces the 25 MB cap against the object's real `ContentLength` rather than the client's `sizeBytes` claim.
- **File validation** — mime types are an allowlist signed into the upload URL, and the size cap is checked both on the way in and against storage. The file bytes never pass through Node.

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
- `POST /auth/change-password` — authenticated; `{ currentPassword, newPassword }` (min 6) → `{ message }`. Requires the current password even though the caller is already signed in: a session left open on a shared phone should not be enough to lock the owner out of their own account. On success it rehashes and **deletes every `refresh_tokens` row for the user**, so other sessions stop renewing.
- `DELETE /auth/me` — authenticated; `{ password }` → **204**. Confirms the password for the same reason `change-password` does, then one `delete from users` removes the account: every child table cascades (medicines, family members, health profile, refresh tokens, reset tokens, report rows). `deleteUserObjects(userId)` then sweeps `reports/<userId>/` in R2, best-effort — the rows are gone either way, so a storage failure must not turn a successful deletion into an error. The share code dies with the account. An access token still verifies until it expires, but the row behind it is gone: `/auth/me` answers 404 and writes fail the foreign key. Its own rate limiter (`deleteAccountLimiter`) keeps wrong-password guesses from spending the login budget. A password-less account (null `password_hash`, reserved for future password-less sign-in) has nothing to confirm.
- `POST /auth/password-reset/request` — `{ email }` → emails a 6-digit code via Resend; always returns a generic 200 to avoid email enumeration.
- `POST /auth/password-reset/confirm` — `{ email, code, newPassword }` → verifies the code, sets the new password, and revokes every refresh token. The code is capped at **5 wrong attempts** via `password_reset_tokens.attempts`: each mismatch increments the counter and the 5th deletes the row, forcing a fresh request. The lookup is by `userId`, not by code hash — counting failures requires finding the row, and `/request` already deletes any previous code, so there is exactly one. An unknown email therefore touches nothing and returns the same generic `Invalid or expired reset code`.

`toPublicUser` is the single serializer for a user; it returns `id`, `name`, `email`, `phone`, `shareId`, `gender`, `bloodGroup`, `dateOfBirth`, with every nullable column flattened to `""` rather than `null` so the app's string-typed `UserProfile` needs no null handling.

**An absent key in `PATCH /auth/me` means "leave alone", which is why `dateOfBirth` does *not* use `optionalCalendarDateSchema`.** That schema is `.optional().default("")`, so a request that never mentioned the field would come back with the date wiped. The route uses `z.union([calendarDateSchema, z.literal("")]).optional()` instead, and each field is copied into the update only when `!== undefined`. A `""` the client *does* send is a real answer (an unset blood group) and is stored as `null`.

Token model (refresh rotation):

- **Access token** — short-lived JWT (`JWT_SECRET`, default 15m), stateless; `authenticate` verifies signature + expiry only (no DB hit) and sets `req.user = { id, email }`.
- **Refresh token** — opaque 48-byte random string, stored only as a sha256 hash in `refresh_tokens`. Rotation deletes the old row and inserts a new one, so reuse after rotation fails. The delete is `.delete(...).returning({ id })` and **zero rows back is the guard** — that means the token was already spent, so rotation is refused (`Refresh token already used`) rather than minting a second pair. Relying on the affected-row count rather than a preceding `SELECT` is what stops two concurrent refreshes with the same token from both succeeding.
- Passwords are hashed with bcryptjs (12 rounds); emails are normalized (trim + lowercase) before storage/lookup. Reset-code comparison goes through `resetCodeMatches` (`timingSafeEqual` over the raw sha256 digests), not `===`, so a wrong guess cannot be narrowed by response timing.

## Sync (`/sync`)

Both routes require `authenticate` and operate on `req.user!.id`:

- `GET /sync` — the account's state: `{ healthProfile, medicines, familyMembers }`.
- `POST /sync` — accepts a partial snapshot, merges it, and returns the **merged** state, so the client can adopt the response wholesale instead of tracking what changed.
- `PUT /sync/health-profile` — `{ weightKg?, heightCm?, bloodGroup?, gender? }` → `{ healthProfile }`. Saves the profile **outright**, upserting on the `user_id` unique index.

**The health profile has two write paths, and the difference is the whole point.** `POST /sync` only *seeds* it — the insert is guarded on the account having no row, so a returning account is never clobbered by whatever an anonymous device happened to be holding when someone signed in. That guard is load-bearing and must stay. But it also means an edit made *after* sign-in has nowhere to go: sent through `/sync` it validates, is accepted, and is silently dropped. `PUT /sync/health-profile` is the other act — the user, signed in, on a screen showing their own numbers, saying what they are — so it upserts. The two must not be merged back together: making `/sync` upsert would reopen exactly the clobbering hole the seed guard closes, and routing the edit through `/sync` would keep losing it.

It validates with the same `healthProfileSchema` as the sync, so an unknown blood group is refused in the same shape either way, and it is a **full replace** rather than a merge — an omitted field takes its `""` default and blanks the column. That is what the client wants (its form always holds all four values and Save means "this is my profile now"), but a future partial-update caller would need `.partial()` here instead. `updatedAt` is set explicitly, since a raw `onConflictDoUpdate` would otherwise leave the row claiming it was last written when it was created.

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

The **health profile** is `{ weightKg, heightCm, bloodGroup, gender }`, all `text` columns so the app's all-strings `HealthProfile` needs no null handling, and all `""` on the wire. It is not part of the domain payload: `syncSchema` extends `domainWriteSchema` with it, so it is written by `/sync` alone and can never appear in a `/family/:shareId` response. It is **seeded, never merged** — written only when the account has no row, so a returning account's real measurements are never clobbered by whatever an anonymous device happened to be holding.

`bloodGroup` replaced a `blood_pressure_sys`/`blood_pressure_dia` pair, and the swap is the clearest example of the optional-with-default rule above. Both new keys are `.optional().default("")`, and `bloodGroup` is constrained by `z.enum(BLOOD_GROUP_VALUES)` *with the blank in the list*. So a device still on the previous build — sending the two pressure fields and no blood group — validates, has its unknown keys stripped by zod, and writes a profile with no blood group, rather than 400-ing its entire sync over a field it has never heard of. `""` is a real answer here, not a gap: the onboarding step it comes from is skippable. `toHealthProfile` clamps through the same list on the way out, so a hand-edited value can never reach the client and be echoed straight back into a payload this API rejects — the identical reasoning to `mealTiming` and the report `category`.

The `frequency`/`time` columns it replaced were dropped in migrations `0005` and `0006`; because drizzle-kit cannot tell an added column from a rename without a TTY, the drop and the add were generated as two separate migrations rather than one interactive pass. `days` and `started_on` arrived in `0007`, and `ended_on` in `0008` — both plain column adds, so they generated non-interactively. `doctor_name`/`specialty` came in `0009`, `0010` added the Family ID and the Profile identity fields (see below), `meal_timing` in `0011` — a plain nullable add, with no backfill, since a blank meal timing is the correct value for every row that predates it — and `0012` added `password_reset_tokens.attempts`, a `NOT NULL DEFAULT 0` add backing the reset-code attempt cap. `0013` created the `reports` table (see "Reports") and `0014` added its `thumbnail_key`, another plain nullable add.

`0015`/`0016` swapped `health_profiles`' blood pressure for a blood group and had to be generated the same two-pass way as `0005`/`0006`, for the same reason: drizzle-kit saw one dropped pair and one added column and wanted to ask whether it was a rename, which it cannot do without a TTY. The first pass ran against a temporarily restored `schema.ts` so the diff was the lone `ADD COLUMN "blood_group"`, the second against the real one so the diff was the two lone `DROP COLUMN`s. The two are **not** one migration with three statements in it — the tool writes the snapshots it had at each step, and hand-merging them is what the split avoids. The drop is irreversible in the ordinary sense: a pressure reading was only ever what an older build of the app stored in a field that nothing else read, and the client had long since stopped sending one.

### Shared with `/family`

`routes/sync.ts` exports the pieces both it and `routes/family.ts` need, so the two surfaces cannot drift:

- `domainWriteSchema` — the writable domain payload (`{ medicines?, familyMembers? }`). `syncSchema` is this `.extend`ed with the health profile; the family routes take it as-is, which is what keeps the owner's health profile out of `/family/*` by construction rather than by remembering to strip it.
- `domainSnapshot(userId)` — the domain half of a snapshot (medicines + family members, no health profile). `/sync` composes it with the profile query.
- `mergeDomain(userId, input)` — the add-only insert pass, plus the `startedOn`/`endedOn`/`doctorName`/`specialty`/`mealTiming` blank-to-`null` and `age ?? null` mappings.
- `medicineSchema`, `familyMemberSchema`, `calendarDateSchema`, `optionalCalendarDateSchema` — the validators behind the above.
- `BLOOD_GROUP_VALUES` — the eight ABO/Rh labels plus `""`, the one list both places that accept a blood group validate against: `healthProfileSchema` here and `PATCH /auth/me` in `routes/auth.ts`. It lives in this file because `auth.ts` already imports `calendarDateSchema` from it, so the shared pieces travel one way and there is no cycle — do not move it back into `auth.ts`. Adding a ninth label is a change to this array and to the client's `BLOOD_GROUPS`, never a migration: the column is plain `text`.

There are no per-resource CRUD routes and **no delete path for medicines or family members** — a record removed on the device will reappear from the server on the next sync. Adding deletes there means adding tombstones or a real `DELETE` route, not just filtering the client array. `/reports` is the deliberate exception: it is its own resource with its own `DELETE`, added because a document uploaded by mistake has to be removable in a way an append-only log of doses never needed to be.

## Family ID (`/family`)

`users.share_id` is an 8-character uppercase code from an unambiguous alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `I`, `L`, `O`, `0`, `1`, so a code read aloud or off a screenshot can't be mistyped into a different valid one). `src/utils/shareId.ts` owns `generateShareId`, `normalizeShareId` (trim + uppercase), and `generateUniqueShareId`, which retries against the database and is what `POST /auth/register` calls. The `users_share_id_unique` index is the real guarantee; the retry loop is the courtesy.

Routes — **all unauthenticated, and that is the design, not an oversight**:

- `POST /family/connect` — `{ shareId }` → `{ shareId, name }`, 404 if no account has that code. Separate from the data read so the client can confirm "Connect to Salma?" and so a mistyped code fails before any state changes.
- `GET /family/:shareId` — the linked account's `{ medicines, familyMembers }`.
- `POST /family/:shareId` — same payload and same add-only `mergeDomain` as `/sync`, returning the merged snapshot.

**The Family ID is a bearer credential.** The requirement is that a relative who has just installed the app — with no account of their own — can type in a code and start recording medicines for whoever shared it; requiring `authenticate` would defeat exactly that. So anyone who learns a code gets read and append access to that account's medicines and family members. Three things bound it: the merge is add-only (`onConflictDoNothing` — no update, no delete, so the worst case is spurious rows rather than lost or altered ones), an id already owned by a third account is skipped rather than reassigned, and the owner's `health_profiles` row is never in scope. A future "these routes are unauthenticated" finding is a product decision to raise, not a bug to patch — all three routes are rate-limited (`connectLimiter`, `familyReadLimiter`, `familyWriteLimiter`), which throttles guessing and spam without changing the model, and the agreed hardening path beyond that is invite/accept with signed tokens, never simply bolting `authenticate` on.

Migration `0010` adds the column as **nullable**, backfills existing rows with a `DO $$ ... $$` plpgsql loop, and only then creates the unique index. The nullable add is forced: `ADD COLUMN ... NOT NULL` with no default fails outright on a non-empty table, so the constraint arrives as a unique index instead. The hand-edited backfill sits between the two, giving each codeless row an 8-character code from the same misread-resistant alphabet the app generates from and re-rolling until the candidate matches no row already assigned — so the `CREATE INDEX` that follows cannot fail on a clash. The index would have tolerated repeated `NULL`s anyway; the backfill is there because an account with no code could never be shared, not because the index demands a value.

## Reports (`/reports`)

Uploaded medical documents — lab results, scans, prescriptions. This is the one resource whose **bytes do not live in Postgres**: the file is in the R2 bucket and the `reports` row is the metadata that makes it findable. That single fact shapes everything below.

**The file never passes through this server.** Node never buffers an upload, and the size of a report is bounded by storage rather than by the API's body cap:

1. `POST /reports/upload-url` — `{ id, fileName, mimeType, sizeBytes }` → `{ storageKey, uploadUrl, thumbnailKey, thumbnailUploadUrl }`. Validates the type, builds the key from `req.user!.id` and a presigned PUT (5 min), and — for an image — signs a second key for its preview.
2. The device PUTs the bytes **straight to storage** at `uploadUrl`, and its preview at `thumbnailUploadUrl`.
3. `POST /reports` — `{ id, title, category, takenOn, file }` → `{ report }`, recording that the object exists. `file` carries `thumbnailKey` alongside `storageKey`. Before inserting, the route HEADs the object and refuses with 404 when it is not there (the upload never happened) and 400 when its real `ContentLength` exceeds 25 MB — the body's `sizeBytes` is only the client's claim.

The id comes from the client at step 1, which is why the object key and the row share it: the key is `reports/<userId>/<reportId>-<name>`, so retrying a failed upload overwrites the same object instead of orphaning the first attempt, and replaying the create hits `onConflictDoNothing` and returns the existing row rather than 500-ing.

**The preview is generated by the device, and this server never looks at the pixels.** That is the same division of labour as the upload itself: Node has no image pipeline and should not grow one, and the device is the only place that can tell a lab report (which has to stay legible) from a photo of a receipt. So the API's whole involvement is to sign a key for it, record it, and sign it back on the way out. Two consequences worth keeping:

- **A preview is only signed for an image.** A PDF has no pixels to preview, so `thumbnailKey` comes back as `""` rather than as a URL nobody can use — a second signed PUT for a file that will never exist would only be a second way for an upload to half-fail.
- **`thumbnailKey` is optional on the way in** (`.optional().default("")`). A client that predates previews, or one whose preview generation failed on the device, still creates its report: a missing preview is a cosmetic loss and not a reason to refuse a document the user has already uploaded. `""` is stored as NULL, and `toReport` flattens it back to `""` — one shape either way, so the client never branches on null.

The thumbnail key is client-supplied in exactly the same way the file key is, and is therefore checked the same way — see below.

**Step 3 is where a client could try to attach someone else's object to its own row**, so it refuses any `storageKey` that does not start with `reports/<its own userId>/`. The preview key is checked by the same rule, because `thumbnailStorageKey` deliberately puts it under the same prefix — one prefix check covers both, where a second, parallel rule is a second place for the two to drift apart. That prefix check is the whole authorization for the object — storage itself has no idea who is calling. Presence and size are separate questions, answered by `headObject` against storage; the thumbnail is deliberately not HEADed, since a missing preview is cosmetic and a second storage call on every create buys nothing.

The rest of the surface:

- `GET /reports` — the account's reports, newest first by `createdAt` (not `takenOn`, which is optional and would have to sort somewhere arbitrary). Returns **no** download URL: one embedded here would be stale by the time it was used.
- `GET /reports/:id/download-url` — a fresh presigned GET (10 min), or `R2_PUBLIC_URL/key` when a public domain is configured, plus `thumbnailUrl` signed in the same response (`""` when there is no preview). Signed on demand, which is what keeps it valid long enough to actually load the file; the preview is signed alongside because it is wanted at the same moment, by the same caller, for the same screen.
- `GET /reports/thumbnail-urls` — `{ urls: { [reportId]: url } }` for every report in the account that has a preview, in one request rather than one per row, since a list renders them all at once and a signed URL costs a signature each. A separate endpoint rather than a field on the list **because these URLs expire**: embedding them in `GET /reports` would take the list stale with them, and kept apart the list stays a record of what exists while a slow or failed preview never holds it up. Where storage is not configured it answers `{ urls: {} }` rather than 503 — the list is perfectly usable with its category icons, and an error there would put a failure on a screen that has nothing wrong with it.
- `DELETE /reports/:id` — 204. The row goes first and the objects after, best-effort: the row is what makes them reachable, so a failed storage delete leaves nothing the user can see, whereas the reverse would leave a row pointing at a missing object and render as a broken image. The preview goes with the file, and only when the row has one — a row written before that column existed has none.

Every route requires `authenticate`. Reports are **not** part of `/sync` (a file is not a value the device can hold and merge) and are **not** exposed by `/family/:shareId` — managing a relative's medicines is a different act from reading their lab results. Reports are per-account and deliberately not shared.

Two validation details worth keeping:

- **`mimeType` is an allowlist** (`image/jpeg|png|heic|webp`, `application/pdf`), not a pattern. It is signed into the upload URL and stored on the row, and the client decides how to open the file from it, so an open-ended check would let a client store a content type neither side knows how to render.
- **`sizeBytes` allows `0`, meaning "the device could not determine it."** Android's photo picker sometimes reports no size, and a `.positive()` there would reject a perfectly good upload over metadata the user cannot influence. The 25 MB cap still applies to every size that *was* reported, so this admits an unknown size, not an oversized one.

`category` is plain `text` with a `z.enum(["lab","prescription","xray","other"])` on the way in and a clamp to `"other"` in `toReport` on the way out — the same shape as `mealTiming`, for the same reason: a text column with no constraint would let a bad value reach the client and be echoed straight back into a rejected payload. Acting on that decision means changing the validator and the client's `REPORT_CATEGORIES`, never a migration.

`utils/r2.ts` is the S3 client (`@aws-sdk/client-s3` + `s3-request-presigner`), pointed at `R2_ENDPOINT` with region `"auto"`. It owns every key this API hands out: `storageKey`, which sanitizes the device file name down to `[A-Za-z0-9._-]` before it goes into the key — object keys are a flat namespace, so a name containing `/` or `..` would silently nest or traverse — plus `thumbnailStorageKey` and `storagePrefix`, the `reports/<userId>/` prefix that both keys are checked against. The preview is `reports/<userId>/thumbs/<id>.jpg`: a `thumbs/` **segment** rather than a suffix on the file's own key, because that key ends with a name the *client* chose, so a report picked from a file literally called "thumb.jpg" would otherwise reserve exactly the same key as its own preview and the second upload would land on top of the first. Since sanitizing strips every `/`, a file's key is always one segment after the user id and a preview's always two, so the two cannot meet — and the preview needs no sanitizing of its own, being a JPEG this app produced. The display name survives untouched in the `fileName` column, so nothing user-visible depends on that sanitizing being lossless.

## App version (`/app`)

`GET /app/version` → `{ latestVersion, storeUrl }`, so an installed build can tell whether a newer one exists. **Unauthenticated**, for the same kind of reason `/family` is: a device that has not signed in still runs the app and still deserves to be told, and the answer is a public release number rather than anything about an account.

Two env vars behind it and **no table**: `LATEST_APP_VERSION` and `STORE_URL`. That is the entire release mechanism — set the version and redeploy — and it is the point rather than a shortcut, because a value baked into the app could only ever announce itself. An empty `latestVersion` means "nothing announced" and is a **valid answer, not an error**: it is what a fresh clone and a pre-release deployment both report, and the client shows no notice. `storeUrl` may be empty independently while there is no store listing to point at, in which case the client renders the notice as information with nothing to tap. No row is written, nothing is read from the database, and the route is deliberately synchronous — there is nothing to await. The version *comparison* lives on the client (`ownMed/src/lib/notices.ts`); this end only reports a string.

## Not built yet

Remaining work: per-resource CRUD (health profiles, medicines, family members) and an **update** path — there is still no way to modify a medicine once it exists, which is why `recoverFromLocal` on the client has to repair blank schedules locally: the server has no way to be told. Deletes exist only for `reports`, `users` (`DELETE /auth/me`) and their cascades; individual medicines and family members remain append-only. Prescription *reading* is stubbed on the client (`src/lib/prescription.ts` throws) and has no server side at all. Report storage is no longer unexercised: with real `R2_*` credentials in place it has been driven from the app end-to-end, so the S3 client, the presigns and the `storageKey` prefix check are known-good rather than merely written. A deployment without those keys is still a valid state — the routes answer 503 and nothing else is affected — which is where a fresh clone starts.

The client renews its own tokens now: `src/lib/api.ts` retries an authenticated 401 once against `/auth/refresh`, single-flight so concurrent 401s share one rotation. What is still missing is a background re-sync — nothing retries a failed sync while the app is closed.

On `/family`, all three routes are rate-limited (see "Rate limiting"), so the remaining follow-up is hardening rather than features: invite/accept with signed tokens, which would replace the bearer-code model rather than throttle it. Until then the 8-character code is the whole credential.
