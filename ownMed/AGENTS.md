This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo export --platform android  # bundle — the only check that catches Metro resolution failures
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done. Typecheck and lint do **not** prove the app builds: a missing or misresolved dependency fails at bundle time, not in `tsc`, so run `npx expo export` when you have touched imports or dependencies.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## App structure

Bottom tab navigator (`src/app/(tabs)/_layout.tsx`) with five tabs, in order: **Health Tips · Dashboard · Home · Settings · Account**. **Home** (`index.tsx`) is the opening tab — it is declared with `initialRouteName="index"` and sits in the middle position. Its icon and label are drawn a size up from the other four (`tabBarIcon` gets `size + 5` with a heavier `tabBarLabelStyle`), so the opening tab reads as the current one at a glance.

- **Health Tips** — `health-tips.tsx`: a featured "tip of the day" (rotates by calendar date) plus a grid of wellness cards.
- **Dashboard** — `dashboard.tsx`: a drawer-driven screen that swaps between feature sections (see below).
- **Home** — `index.tsx`: the landing page — brand header, hero card, a "what you can do" feature grid, a wellness-tip strip, a trust row, and a medical disclaimer. Feature cards link into `/dashboard`.
- **Settings** — `settings.tsx`: Profile (static), Theme (toggles light/dark via `useAppTheme()`), Language (toggles English ↔ Bangla).
- **Account** — `sign-in.tsx`: email/password + "Remember me" + "Forgot password?" (validated with `react-hook-form`). Footer links to the hidden `sign-up` route (`sign-up.tsx`, `href: null`); "Forgot password?" opens the hidden `forgot-password` route (`forgot-password.tsx`, `href: null`).

### Dashboard

`dashboard.tsx` holds an `active` section id and renders the matching component from `SECTION_COMPONENTS` (`src/components/dashboard/sections.ts`); a slide-in `Drawer` switches sections. Published sections:

- **Overview** — health-stat cards + recent activity.
- **Profile** — personal info (name, read-only email, phone, gender, blood group, date of birth) and change password. No profile image: it was removed deliberately, so don't reintroduce an avatar or an image picker. Gender and blood group are chip rows, date of birth is a `DateField` with `maximumDate` set to today; saving goes to the backend via `PATCH /auth/me`, with a cleared chip sent as `""` rather than dropped, since the server reads an absent key as "leave this alone". Email is shown `editable={false}` because it identifies the account — changing it needs re-verification and is a separate feature. **Update password** posts to `/auth/change-password` (which demands the current password even though the user is signed in) and then clears its fields and signs out to `/sign-in` behind a non-cancelable alert: that call revokes every refresh token server-side, so the session can no longer be renewed and dismissing the alert would strand the user on it.
- **Add Medicine** — a two-mode screen. A segmented control switches between **Add manually** and **Upload prescription**; upload is not a section of its own because it is the same job by another route. The manual form is name + dosage, then **When to take** (Before meal / After meal chips, optional and tap-to-clear), then **Doctor name** and **Specialty** (both optional — an over-the-counter medicine has no prescriber), then the schedule controls: **Reminder times** (preset chips Morning 08:00 / Afternoon 12:00 / Evening 18:00 / Night 22:00 toggled on and off, plus a free-form box for any other time), **Days** (seven weekday chips, all on by default), **Started on** and **End date** (both calendar pickers — see `DateField`; the end date is clearable, and blank means "Ongoing"). Below the form, two matrices read back the schedule: `MedicineWeekTable` (days of the week, with the start and end dates per row) and `MedicineScheduleTable` (clock times). Both read `useAppData()`.
- **Medicine History** — every medicine ever added, newest first, with a per-row status badge ("Ongoing", or "Ended <date>" once `endedOn` is in the past). Each card summarises the schedule and adds the meal timing only when one was recorded. A segmented control switches between **Newest first** and **By doctor**, which regroups the same records under `doctorName` (named doctors alphabetically, with the blank-`doctorName` bucket last as "No doctor recorded"). Reading order in that mode matches how people actually search: they remember the doctor long after the date.
- **Family Member Status** — the family member list + add form, plus the **Family ID** connect card; all backed by `useAppData()`. While linked it swaps to a "Managing <name>" banner with a Disconnect button, and the add form writes to that account instead of this device.

**Find Doctor, Find Pharmacy, Find Hospital, and Appointments are intentionally not published in this release.** Their section components and mock data remain in `src/components/dashboard/sections/` and `src/components/dashboard/mock.ts` so they can be re-enabled later — just re-add them to `sections.ts` and to the `SectionId` union in `src/components/dashboard/types.ts`.

### The medicine schedule model

A `Medicine` is `{ id, name, dosage, times, days, startedOn, endedOn, doctorName, specialty, mealTiming }` — two **independent** schedule axes, a date range, who prescribed it, and when to take it:

- `times` — sorted unique 24h `"HH:mm"` strings. **Frequency is not stored**; it is derived as `times.length` and shown as `2×/day`, so a medicine can never claim a dose count its own schedule contradicts. There is no per-slot tablet count; a time is simply on or off.
- `days` — sorted weekdays taken, as `Date.getDay()` values (0=Sun..6=Sat), so they stay meaningful against a real date. A day left out is a day it is *not* taken; `ALL_DAYS` means daily.
- `startedOn` / `endedOn` — local `"YYYY-MM-DD"` strings, not timestamps: they are calendar dates, so an instant type would drag timezone conversion into a value that has none. **`endedOn: ""` means the course is ongoing** — the normal case for a chronic medicine, so it is a real state rather than a missing value.
- `doctorName` / `specialty` — who prescribed it, and their field. Both are **optional by nature** (`""` = not recorded), because plenty of medicines are bought over the counter, and a required doctor would make those impossible to record. Nothing is derived from them; they exist so Medicine History can group by prescriber.
- `mealTiming` — `"before" | "after" | ""`, i.e. before or after food. Optional for exactly the same reason: many medicines have no meal relation at all, so `""` is a real answer and not a gap. The two options live in `MEAL_TIMINGS` (`src/lib/medicineSchedule.ts`) and the server accepts nothing else, so widening the set is a code change on both sides and never a migration.

The two tables show the cross-product: `MedicineWeekTable` (columns from `WEEK_DAYS`, Sat-first to match the Bangladeshi calendar, plus each row's start/end dates) and `MedicineScheduleTable` (columns from `unionTimes`).

`src/lib/medicineSchedule.ts` owns the shared logic — `TIME_PRESETS`, `WEEK_DAYS`/`ALL_DAYS`, `MEAL_TIMINGS`, `parseTime` (tolerant input: `8`, `8:30`, `0830`, `8pm`, `20:00`; rejects anything ambiguous or out of range), `todayISO`, `isValidDateString`, `isoDate`/`parseISODate`/`formatDate`, `sortTimes`/`sortDays`, `presetLabel`/`dayLabel`/`mealTimingLabel`, the defensive readers `timesOf`/`daysOf`/`startedOnOf`/`endedOnOf`/`mealTimingOf`, `unionTimes`, `frequencyLabel`/`daysLabel`, `recoverFromLocal`. Prefer these over re-deriving the same rules in a component.

**Dates are picked, not typed.** `src/components/ui/DateField.tsx` wraps `@react-native-community/datetimepicker`: Android uses the library's imperative `DateTimePickerAndroid.open` (its picker *is* a dialog, so there is no component to mount and no `visible` state to fall out of sync), and iOS renders the inline calendar inside a `Modal` we control. It uses `onValueChange`/`onDismiss` — `onChange` still works but logs a deprecation warning. Reach for `DateField` rather than a `TextInput` for any new date.

**Records predating this model are migrated on read, not dropped.** AsyncStorage holds whatever an older build wrote, so `loadMedicines` runs every record through `normalizeMedicine`, which adopts any clock times it finds in the legacy `time` string (`"08:00, 20:00"`) as the new schedule, tolerates a missing/`undefined` `times`, and fills `days`/`startedOn`/`endedOn` with their defaults when absent or malformed. A record with no usable weekdays gets `ALL_DAYS` rather than an empty list — "no days" would mean a medicine that is never taken, which the form refuses to create and the server rejects, so one such record would fail an entire sync payload. An `endedOn` before its `startedOn` is likewise treated as ongoing: the form cannot produce it, and rendering "Ends Oct 1" under "Started Oct 7" would be worse than showing nothing.

The sync merge is add-only, so `recoverFromLocal` also refills a medicine the server holds with an **empty `times`, blank `startedOn`, or blank `endedOn`** from the device copy — without it, signing in would erase a schedule that only the device still remembers. `days` is deliberately *not* recovered: its blank state already means the all-7 default. `doctorName` / `specialty` are not recovered either, for a different reason: no medicine already on the server can have had a prescriber, since the columns did not exist when those rows were written and there is no edit path to add one. `mealTiming` is in that same group — a server row with a NULL timing predates the column, so the device copy is blank too and there is nothing to refill it from. The recovery is device-local: the server copy stays empty until medicines get an update path.

### Onboarding

`src/components/onboarding/OnboardingModal.tsx` renders on first launch (mounted in `src/app/_layout.tsx`). It is a 3-step walkthrough — how-to-use (the five tabs), guest vs. account, and health details (weight, blood pressure, height, gender) with a Skip option. Gated on an `onboarded` flag persisted via AsyncStorage.

### State & persistence

- `src/lib/storage.ts` — typed AsyncStorage wrapper. Keys are namespaced (`ownmed.*`). The `onboarded` key is versioned (`.v2`) so bumping it re-shows the walkthrough. Holds `authUser` + `authTokens`, the health profile, the medicine / family-member lists, and `familyLink`.
- `src/lib/api.ts` — typed `fetch` client (`register`, `login`, `requestPasswordReset`, `confirmPasswordReset`, `logout`, `updateProfile`, `changePassword`, `getSync`, `postSync`, `connectFamily`, `getFamily`, `postFamily`). The base URL is `EXPO_PUBLIC_API_URL` when set — a built app has no Metro host to infer from, and Expo inlines `EXPO_PUBLIC_*` at build time — otherwise auto-detected from Expo's `hostUri` (LAN IP), with a null override for manual config. It also owns the session tokens; see "Token lifecycle".
- `src/lib/prescription.ts` — the seam where prescription reading will land. `parsePrescription()` currently throws; it is the single place a vision provider gets wired in, so nothing else has to change when it becomes real.
- `src/context/AppDataContext.tsx` — `AppDataProvider` + `useAppData()` exposing `hydrated`, `onboarded`, `healthProfile`, `authUser`, `medicines`, `familyMembers`, `familyLink`, `syncPending`, and actions `completeOnboarding`, `skipOnboarding`, `addMedicine`, `addFamilyMember`, `lookupFamily`, `connectFamily`, `disconnectFamily`, `updateProfile`, `changePassword`, `register`, `signIn` (takes a `rememberMe` flag), `requestPasswordReset`, `confirmPasswordReset`, `signOut`. Wraps the whole app in `src/app/_layout.tsx`.

- **Guest vs. registered.** Everything is written to AsyncStorage first, for guests and signed-in users alike, so the UI reads local data and works offline. Registering/signing in persists the returned `authUser` + tokens locally — but only when "Remember me" is checked; otherwise the session is in memory and lost on restart.

`medicines` / `familyMembers` are the **active scope**, not necessarily the user's own — see "Family ID" below.

### Guest mode & sync

New records get a **client-generated UUID** (`expo-crypto`'s `randomUUID()`), assigned before the row ever reaches the server so the sync upserts stay idempotent.

`register` and `signIn` both end with `syncWithAccount()`, which `POST`s the whole local snapshot to `/sync` and **adopts the merged result** as the new local state. The merge is add-only: medicines and family members upsert by id (`ON CONFLICT DO NOTHING`), and the health profile is written only when the account has none — so a returning account is never overwritten by whatever an anonymous device happened to hold.

**A signed-in add does not wait for the next sign-in.** `addMedicine` also pushes just that one medicine to `POST /sync` immediately (`pushOwnMedicine`), best-effort and *without* adopting the response: the optimistic list is already correct on screen, while the server's snapshot would omit any other local row that has not been pushed yet. It goes through the ordinary authenticated call, so it reaches the server for a "remember me"-less session too — the token lives in `lib/api` for the life of the session either way, which is also why `updateProfile` needs no special handling. Only a guest stays local, and is carried up by the next sign-in; nothing is lost, only deferred. `addFamilyMember` does **not** push yet and still relies on the sign-in sync.

The sync is deliberately best-effort: a failure never blocks signing in. It sets a persisted `syncPending` flag instead, and the next sign-in retries. **Nothing retries while the app is closed** — there is no background task, so signing out and back in is what clears a failed sync.

**Guest Data Policy.** Guest data is device-local and gone on uninstall. `src/components/ui/GuestBackupBanner.tsx` (rendered at the top of the dashboard) carries the standing prompt to create an account; sign-out deliberately **keeps** local data rather than wiping it, since that cache may hold records that never reached the server.

Auth: **Sign In / Sign Up are wired to the backend** (`sign-in.tsx` and `sign-up.tsx` call `signIn`/`register` from `lib/api.ts`, then `router.replace('/dashboard')`). `signIn` takes a `rememberMe` flag — unchecked (default) keeps the session in memory only, checked persists it to AsyncStorage. **Forgot password** (`forgot-password.tsx`) sends a Resend-emailed 6-digit code via `/auth/password-reset/*`. **Sign out** (the avatar menu in `DashboardHeader`) revokes the refresh token via `/auth/logout` and returns to `/sign-in`. Google sign-in has been removed and will be re-implemented later.

`DashboardHeader`'s avatar is the user's **initials** (`initialsOf` — first and last word, so "Rahim Uddin" is "RU"), not an icon or a photo; the same dropdown below it shows the Family ID when signed in, or a "sign in to get one" hint for guests.

The onboarding `healthProfile` feeds **Dashboard → Overview**: weight and blood pressure are overridden when present; other stats fall back to `HEALTH_SUMMARY` mock values.

### Token lifecycle

The token pair lives at **module scope in `src/lib/api.ts`**, not in React state — a retried request has to swap it *inside* a call, outside any render, at a moment when no component is mounted. `AppDataContext` mirrors it into state and (for a "remember me" session) onto disk, and registers two listeners, but `lib/api` is what a request actually consults.

An authenticated call that comes back **401 refreshes once and retries**; a second 401 is surfaced as-is, since a token minted moments ago being refused is not a freshness problem. Two mechanisms carry the weight:

- **Single-flight.** Refresh tokens are single-use — the server deletes the row on rotation and refuses reuse — so several screens 401-ing at once must share **one** refresh. Concurrent refreshes would race, and every loser would look like a stolen token. All callers await one module-level promise.
- **A generation counter.** A refresh that started before a sign-out must not land afterwards and resurrect the session, so it captures the counter and discards its result if the counter has moved.

**Only a 401/403 ends the session** — an explicit refusal of the token itself. A network failure or a 5xx is the server having a bad moment, so the tokens are kept and the error surfaces with the server's status (or `statusCode 0` for an unreachable host); signing the user out there would turn a blip into a forced re-login. When the session *is* over, `onEnded` clears the tokens and routes to `/sign-in`, rather than leaving the user on a dashboard that has silently become the guest view.

`signOut` revokes the **live** refresh token rather than the one on disk: after a refresh those differ, and revoking the stale copy would leave the real session alive on the server.

### Family ID

Every account gets an 8-character **Family ID** (`users.share_id`, shown in the dashboard header dropdown and copyable there). A relative types that code into **Dashboard → Family Member Status → Connect** and can then add medicines and family members to that account — **without signing in**. That is the point of the feature, so the connect card is deliberately available to guests; don't gate it behind auth.

The code resolves in two steps so a typo costs nothing: `lookupFamily(shareId)` resolves it to a name and throws if unknown, the UI asks "Connect to <name>?", and only then does `connectFamily(contact)` change scope. `disconnectFamily()` clears the link and reloads **this device's own** lists from AsyncStorage.

What "scope" means in practice:

- `medicines` / `familyMembers` in `useAppData()` are whatever is currently being managed, which is the linked member's data while `familyLink` is set. **Add Medicine, Medicine History and Family Member Status all follow it for free**, because they read those lists rather than fetching their own.
- `addMedicine` / `addFamilyMember` **branch on `familyLink`**: linked writes go to the family account via `POST /family/:shareId` and are *not* written to this device's cache — a family member's medicine saved locally would reappear in the user's own list the moment the link dropped.
- `familyLink` persists (`ownmed.familyLink`), and an effect keyed on `linkedShareId` refetches on restart, since hydration can only load the *device's* own lists from disk.
- Signing in while linked pushes **the device's own** lists (`loadMedicines()`/`loadFamilyMembers()`), never the ones on screen — otherwise a family member's records would be silently copied into the account. The same reason makes `applyServerState` take an `adoptDomain` flag: the account's data is still written to the cache, but the on-screen lists are left alone while linked.

**The Family ID is a bearer credential.** Whoever knows the 8 characters gets read + append access to that account's medicines and family members; the routes are unauthenticated by design. Three things bound the damage: the server merge is add-only (no update, no delete, so the worst case is spurious rows), an id already owned by a third account is skipped rather than reassigned, and the account owner's `health_profiles` row is excluded from every `/family/*` response. `POST /family/connect` is rate-limited server-side (which throttles guessing, not the design); if this is ever revisited further, the direction is invite/accept with signed tokens — **not** bolting `authenticate` onto the routes, which would break the guest flow the feature exists for.

### Backend

The API lives in **`ownMed_server/`** — a separate npm project (Express 5 + TypeScript + Neon PostgreSQL) with its own `AGENTS.md`. Auth is live (`/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `PATCH /auth/me`, `/auth/change-password`, `/auth/password-reset/*`), and `src/lib/api.ts` calls all of it — `/auth/refresh` included, which is what "Token lifecycle" above is about. Guest-to-account sync is live at `GET`/`POST /sync`. The family share routes are live at `/family/connect`, `GET`/`POST /family/:shareId` and are **unauthenticated** (see "Family ID"). Per-resource CRUD routes do not exist — sync is the only way domain data reaches the server for the account owner, and `/family/*` for a linked member.

### Theme

`src/theme/index.ts` exports `useAppTheme()` → `{ isDark, colors, toggleColorScheme }` plus the `brand`/`status` palettes in `src/theme/colors.ts`. Style with NativeWind `className` (CSS variables in `global.css`); reach for `colors`/`brand` only where a raw value is required (icons, navigation chrome).

### Fonts

**Inter** (primary) and **Manrope** (accent/headings) are loaded in `src/app/_layout.tsx` via `@expo-google-fonts/*`. RN uses a separate file per weight, so `tailwind.config.js` remaps `font-medium`/`font-semibold`/`font-bold` to the matching Inter family (they normally set `fontWeight`, which does nothing here). Use `font-sans` for regular body text and `font-display` / `font-display-bold` for Manrope headings.

### Shared components

- `src/components/ui/FormField.tsx` — labelled `TextInput` with a leading icon and shared focus/error border + icon states. Used by sign-in, sign-up, forgot-password, and the onboarding modal. Prefer it over ad-hoc text fields for new forms.
- `src/components/ui/DateField.tsx` — labelled calendar picker with the same card styling, for any date input. Prefer it over a typed date. Takes `maximumDate` / `minimumDate` to bound the range (Profile passes `maximumDate={new Date()}` for date of birth), and `clearable` where blank is a real state. Backed by `@react-native-community/datetimepicker`, a **native** module: `npx expo install` added it to `app.json`'s plugin list, and an existing dev client won't have it until the next native build.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`. Note that `npx expo install` may also append a config plugin to `app.json` on its own — check `git diff` after installing and commit that change with the dependency.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
