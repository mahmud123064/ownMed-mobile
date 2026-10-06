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
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

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
- **Add Medicine** — local `useState` list (adds/removes medicines).
- **Upload Prescription** — image picker (max 5 images).
- **Family Member Status** — list + local add form.

**Find Doctor, Find Pharmacy, Find Hospital, and Appointments are intentionally not published in this release.** Their section components and mock data remain in `src/components/dashboard/sections/` and `src/components/dashboard/mock.ts` so they can be re-enabled later — just re-add them to `sections.ts` and to the `SectionId` union in `src/components/dashboard/types.ts`.

### Onboarding

`src/components/onboarding/OnboardingModal.tsx` renders on first launch (mounted in `src/app/_layout.tsx`). It is a 3-step walkthrough — how-to-use (the five tabs), guest vs. account, and health details (weight, blood pressure, height, gender) with a Skip option. Gated on an `onboarded` flag persisted via AsyncStorage.

### State & persistence

- `src/lib/storage.ts` — typed AsyncStorage wrapper. Keys are namespaced (`ownmed.*`). The `onboarded` key is versioned (`.v2`) so bumping it re-shows the walkthrough. Holds `authUser` + `authTokens` (refresh token) for persisted sessions.
- `src/lib/api.ts` — typed `fetch` client (`register`, `login`, `requestPasswordReset`, `confirmPasswordReset`, `logout`). Base URL auto-detects from Expo's `hostUri` (LAN IP) with a null override for manual config.
- `src/context/AppDataContext.tsx` — `AppDataProvider` + `useAppData()` exposing `hydrated`, `onboarded`, `healthProfile`, `authUser`, and actions `completeOnboarding`, `skipOnboarding`, `register`, `signIn` (takes a `rememberMe` flag), `requestPasswordReset`, `confirmPasswordReset`, `signOut`. Wraps the whole app in `src/app/_layout.tsx`.
- **Guest vs. registered.** Guest data (health profile, onboarding) lives only in AsyncStorage and is lost on uninstall. Registering/signing in calls the backend and persists the returned `authUser` + tokens locally — but only when "Remember me" is checked; otherwise the session is in memory and lost on restart. Guest health-data sync is a `TODO(backend)` in `storage.ts` (the server has no health-profile routes yet).

Auth: **Sign In / Sign Up are wired to the backend** (`sign-in.tsx` and `sign-up.tsx` call `signIn`/`register` from `lib/api.ts`, then `router.replace('/dashboard')`). `signIn` takes a `rememberMe` flag — unchecked (default) keeps the session in memory only, checked persists it to AsyncStorage. **Forgot password** (`forgot-password.tsx`) sends a Resend-emailed 6-digit code via `/auth/password-reset/*`. **Sign out** (the avatar menu in `DashboardHeader`) revokes the refresh token via `/auth/logout` and returns to `/sign-in`. Google sign-in has been removed and will be re-implemented later.

The onboarding `healthProfile` feeds **Dashboard → Overview**: weight and blood pressure are overridden when present; other stats fall back to `HEALTH_SUMMARY` mock values.

### Backend

The API lives in **`ownMed_server/`** — a separate npm project (Express 5 + TypeScript + Neon PostgreSQL) with its own `AGENTS.md`. Auth is live (`/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/password-reset/*`); the app calls all of these except `/auth/refresh` via `src/lib/api.ts`. Domain routes (health profiles, medicines, prescriptions, family members) are not built yet.

### Theme

`src/theme/index.ts` exports `useAppTheme()` → `{ isDark, colors, toggleColorScheme }` plus the `brand`/`status` palettes in `src/theme/colors.ts`. Style with NativeWind `className` (CSS variables in `global.css`); reach for `colors`/`brand` only where a raw value is required (icons, navigation chrome).

### Fonts

**Inter** (primary) and **Manrope** (accent/headings) are loaded in `src/app/_layout.tsx` via `@expo-google-fonts/*`. RN uses a separate file per weight, so `tailwind.config.js` remaps `font-medium`/`font-semibold`/`font-bold` to the matching Inter family (they normally set `fontWeight`, which does nothing here). Use `font-sans` for regular body text and `font-display` / `font-display-bold` for Manrope headings.

### Shared components

- `src/components/ui/FormField.tsx` — labelled `TextInput` with a leading icon and shared focus/error border + icon states. Used by sign-in, sign-up, forgot-password, and the onboarding modal. Prefer it over ad-hoc text fields for new forms.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
