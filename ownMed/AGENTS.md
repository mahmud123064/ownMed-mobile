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

Bottom tab navigator (`src/app/(tabs)/_layout.tsx`) with five tabs, in order: **Health Tips · Dashboard · Home · Settings · Account**. **Home** (`index.tsx`) is the opening tab — it is declared with `initialRouteName="index"` and sits in the middle position.

- **Health Tips** — `health-tips.tsx`: a featured "tip of the day" (rotates by calendar date) plus a grid of wellness cards.
- **Dashboard** — `dashboard.tsx`: a drawer-driven screen that swaps between feature sections (see below).
- **Home** — `index.tsx`: the landing page — brand header, hero card, a "what you can do" feature grid, a wellness-tip strip, a trust row, and a medical disclaimer. Feature cards link into `/dashboard`.
- **Settings** — `settings.tsx`: Profile (static), Theme (toggles light/dark via `useAppTheme()`), Language (toggles English ↔ Bangla).
- **Account** — `sign-in.tsx`: email/password + "Remember me" + "Forgot password?" (validated with `react-hook-form`). Footer links to the hidden `sign-up` route (`sign-up.tsx`, `href: null`); "Forgot password?" opens the hidden `forgot-password` route (`forgot-password.tsx`, `href: null`).

### Dashboard

`dashboard.tsx` holds an `active` section id and renders the matching component from `SECTION_COMPONENTS` (`src/components/dashboard/sections.ts`); a slide-in `Drawer` switches sections. Published sections:

- **Overview** — health-stat cards + recent activity.
- **Profile** — avatar, personal info, change password.
- **Add Medicine** — name + dosage, then the schedule controls: **Reminder times** (preset chips Morning 08:00 / Afternoon 12:00 / Evening 18:00 / Night 22:00 toggled on and off, plus a free-form box for any other time), **Days** (seven weekday chips, all on by default), **Started on** and **End date** (both calendar pickers — see `DateField`; the end date is clearable, and blank means "Ongoing"). Below the form, two matrices read back the schedule: `MedicineWeekTable` (days of the week, with the start and end dates per row) and `MedicineScheduleTable` (clock times). Both read `useAppData()`.
- **Upload Prescription** — image picker (max 5 images). Not persisted — still a demo stub.
- **Family Member Status** — list + add form, also backed by `useAppData()`.

**Find Doctor, Find Pharmacy, Find Hospital, and Appointments are intentionally not published in this release.** Their section components and mock data remain in `src/components/dashboard/sections/` and `src/components/dashboard/mock.ts` so they can be re-enabled later — just re-add them to `sections.ts` and to the `SectionId` union in `src/components/dashboard/types.ts`.

### The medicine schedule model

A `Medicine` is `{ id, name, dosage, times, days, startedOn, endedOn }` — two **independent** schedule axes plus a date range:

- `times` — sorted unique 24h `"HH:mm"` strings. **Frequency is not stored**; it is derived as `times.length` and shown as `2×/day`, so a medicine can never claim a dose count its own schedule contradicts. There is no per-slot tablet count; a time is simply on or off.
- `days` — sorted weekdays taken, as `Date.getDay()` values (0=Sun..6=Sat), so they stay meaningful against a real date. A day left out is a day it is *not* taken; `ALL_DAYS` means daily.
- `startedOn` / `endedOn` — local `"YYYY-MM-DD"` strings, not timestamps: they are calendar dates, so an instant type would drag timezone conversion into a value that has none. **`endedOn: ""` means the course is ongoing** — the normal case for a chronic medicine, so it is a real state rather than a missing value.

The two tables show the cross-product: `MedicineWeekTable` (columns from `WEEK_DAYS`, Sat-first to match the Bangladeshi calendar, plus each row's start/end dates) and `MedicineScheduleTable` (columns from `unionTimes`).

`src/lib/medicineSchedule.ts` owns the shared logic — `TIME_PRESETS`, `WEEK_DAYS`/`ALL_DAYS`, `parseTime` (tolerant input: `8`, `8:30`, `0830`, `8pm`, `20:00`; rejects anything ambiguous or out of range), `todayISO`, `isValidDateString`, `isoDate`/`parseISODate`/`formatDate`, `sortTimes`/`sortDays`, `presetLabel`/`dayLabel`, the defensive readers `timesOf`/`daysOf`/`startedOnOf`/`endedOnOf`, `unionTimes`, `frequencyLabel`/`daysLabel`, `recoverFromLocal`. Prefer these over re-deriving the same rules in a component.

**Dates are picked, not typed.** `src/components/ui/DateField.tsx` wraps `@react-native-community/datetimepicker`: Android uses the library's imperative `DateTimePickerAndroid.open` (its picker *is* a dialog, so there is no component to mount and no `visible` state to fall out of sync), and iOS renders the inline calendar inside a `Modal` we control. It uses `onValueChange`/`onDismiss` — `onChange` still works but logs a deprecation warning. Reach for `DateField` rather than a `TextInput` for any new date.

**Records predating this model are migrated on read, not dropped.** AsyncStorage holds whatever an older build wrote, so `loadMedicines` runs every record through `normalizeMedicine`, which adopts any clock times it finds in the legacy `time` string (`"08:00, 20:00"`) as the new schedule, tolerates a missing/`undefined` `times`, and fills `days`/`startedOn`/`endedOn` with their defaults when absent or malformed. A record with no usable weekdays gets `ALL_DAYS` rather than an empty list — "no days" would mean a medicine that is never taken, which the form refuses to create and the server rejects, so one such record would fail an entire sync payload. An `endedOn` before its `startedOn` is likewise treated as ongoing: the form cannot produce it, and rendering "Ends Oct 1" under "Started Oct 7" would be worse than showing nothing.

The sync merge is add-only, so `recoverFromLocal` also refills a medicine the server holds with an **empty `times`, blank `startedOn`, or blank `endedOn`** from the device copy — without it, signing in would erase a schedule that only the device still remembers. `days` is deliberately *not* recovered: its blank state already means the all-7 default. The recovery is device-local: the server copy stays empty until medicines get an update path.

### Onboarding

`src/components/onboarding/OnboardingModal.tsx` renders on first launch (mounted in `src/app/_layout.tsx`). It is a 3-step walkthrough — how-to-use (the five tabs), guest vs. account, and health details (weight, blood pressure, height, gender) with a Skip option. Gated on an `onboarded` flag persisted via AsyncStorage.

### State & persistence

- `src/lib/storage.ts` — typed AsyncStorage wrapper. Keys are namespaced (`ownmed.*`). The `onboarded` key is versioned (`.v2`) so bumping it re-shows the walkthrough. Holds `authUser` + `authTokens`, the health profile, and the medicine / family-member lists.
- `src/lib/api.ts` — typed `fetch` client (`register`, `login`, `requestPasswordReset`, `confirmPasswordReset`, `logout`, `getSync`, `postSync`). Base URL auto-detects from Expo's `hostUri` (LAN IP) with a null override for manual config.
- `src/context/AppDataContext.tsx` — `AppDataProvider` + `useAppData()` exposing `hydrated`, `onboarded`, `healthProfile`, `authUser`, `medicines`, `familyMembers`, `syncPending`, and actions `completeOnboarding`, `skipOnboarding`, `addMedicine`, `addFamilyMember`, `register`, `signIn` (takes a `rememberMe` flag), `requestPasswordReset`, `confirmPasswordReset`, `signOut`. Wraps the whole app in `src/app/_layout.tsx`.
- **Guest vs. registered.** Everything is written to AsyncStorage first, for guests and signed-in users alike, so the UI reads local data and works offline. Registering/signing in persists the returned `authUser` + tokens locally — but only when "Remember me" is checked; otherwise the session is in memory and lost on restart.

### Guest mode & sync

New records get a **client-generated UUID** (`expo-crypto`'s `randomUUID()`), assigned before the row ever reaches the server so the sync upserts stay idempotent.

`register` and `signIn` both end with `syncWithAccount(accessToken)`, which `POST`s the whole local snapshot to `/sync` and **adopts the merged result** as the new local state. The merge is add-only: medicines and family members upsert by id (`ON CONFLICT DO NOTHING`), and the health profile is written only when the account has none — so a returning account is never overwritten by whatever an anonymous device happened to hold.

The sync is deliberately best-effort: a failure never blocks signing in. It sets a persisted `syncPending` flag instead, and the next sign-in retries. **Because a retry needs a live access token, nothing retries while the app is closed** — signing out and back in is what clears it. Token auto-refresh does not exist yet, so a long-lived session will not re-sync on its own.

**Guest Data Policy.** Guest data is device-local and gone on uninstall. `src/components/ui/GuestBackupBanner.tsx` (rendered at the top of the dashboard) carries the standing prompt to create an account; sign-out deliberately **keeps** local data rather than wiping it, since that cache may hold records that never reached the server.

Auth: **Sign In / Sign Up are wired to the backend** (`sign-in.tsx` and `sign-up.tsx` call `signIn`/`register` from `lib/api.ts`, then `router.replace('/dashboard')`). `signIn` takes a `rememberMe` flag — unchecked (default) keeps the session in memory only, checked persists it to AsyncStorage. **Forgot password** (`forgot-password.tsx`) sends a Resend-emailed 6-digit code via `/auth/password-reset/*`. **Sign out** (the avatar menu in `DashboardHeader`) revokes the refresh token via `/auth/logout` and returns to `/sign-in`. Google sign-in has been removed and will be re-implemented later.

The onboarding `healthProfile` feeds **Dashboard → Overview**: weight and blood pressure are overridden when present; other stats fall back to `HEALTH_SUMMARY` mock values.

### Backend

The API lives in **`ownMed_server/`** — a separate npm project (Express 5 + TypeScript + Neon PostgreSQL) with its own `AGENTS.md`. Auth is live (`/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/password-reset/*`); the app calls all of these except `/auth/refresh` via `src/lib/api.ts`. Guest-to-account sync is live at `GET`/`POST /sync`. Per-resource CRUD routes do not exist — sync is the only way domain data reaches the server.

### Theme

`src/theme/index.ts` exports `useAppTheme()` → `{ isDark, colors, toggleColorScheme }` plus the `brand`/`status` palettes in `src/theme/colors.ts`. Style with NativeWind `className` (CSS variables in `global.css`); reach for `colors`/`brand` only where a raw value is required (icons, navigation chrome).

### Fonts

**Inter** (primary) and **Manrope** (accent/headings) are loaded in `src/app/_layout.tsx` via `@expo-google-fonts/*`. RN uses a separate file per weight, so `tailwind.config.js` remaps `font-medium`/`font-semibold`/`font-bold` to the matching Inter family (they normally set `fontWeight`, which does nothing here). Use `font-sans` for regular body text and `font-display` / `font-display-bold` for Manrope headings.

### Shared components

- `src/components/ui/FormField.tsx` — labelled `TextInput` with a leading icon and shared focus/error border + icon states. Used by sign-in, sign-up, forgot-password, and the onboarding modal. Prefer it over ad-hoc text fields for new forms.
- `src/components/ui/DateField.tsx` — labelled calendar picker with the same card styling, for any date input. Prefer it over a typed date. Backed by `@react-native-community/datetimepicker`, a **native** module: `npx expo install` added it to `app.json`'s plugin list, and an existing dev client won't have it until the next native build.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`. Note that `npx expo install` may also append a config plugin to `app.json` on its own — check `git diff` after installing and commit that change with the dependency.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
