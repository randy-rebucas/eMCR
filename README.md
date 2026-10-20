# eMCR — Electronic MyClinic Record

The patient mobile app for MyClinicSoft clinics. Patients sign in to see their appointments, the live queue, lab results, prescriptions, bills and documents from their clinic.

Built with Expo SDK 57 (React Native 0.86, Expo Router, TypeScript). The backend is the [`clinic-management`](../clinic-management) Next.js app. The API this app uses is documented in its `MOBILE_API.md` under **Patient app**.

> Medical representatives are not part of eMCR. They will get a separate app.

## Features

| Area | What patients can do |
| --- | --- |
| Sign-in | Email + password, SMS one-time code, or scanning the login QR code from the clinic |
| Home | Summary of what's next |
| Appointments | List, view details, book, cancel |
| Queue | Live position in the clinic queue |
| Results | Lab results list and detail |
| More | Prescriptions, billing/invoices, documents, notifications, notification settings, profile, password, sign out |
| Push | Notifications for appointments, lab results and queue updates; tapping one opens the matching screen |

The app only reads billing data. In-app payment is deliberately not built.

## Getting started

Prerequisites: Node.js LTS and npm. To run on a phone you need the Expo Go app or a development build; for emulators, Android Studio or Xcode.

```bash
npm install
cp .env.example .env    # then set EXPO_PUBLIC_API_URL
npm start               # Expo dev server; press a / i / w for Android / iOS / web
```

The backend (`clinic-management`) has to be running and reachable from the device.

### Configuration

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Backend base URL: the apex domain, never a clinic subdomain. If unset, the app uses `expo.extra.apiUrl` in `app.json`, then `http://localhost:3000`. |

`localhost` only works for web and the iOS simulator. A physical device needs your machine's LAN IP (e.g. `http://192.168.1.20:3000`) or a tunnel (`npx expo start --tunnel`, ngrok).

### Push notifications

Expo Go on Android can't load `expo-notifications` (SDK 53+), so push is turned off there and the rest of the app works normally. To test push, use a development build on a real device. Simulators and emulators don't get push tokens.

## Scripts

| Command | Does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run android` | Start and open on Android |
| `npm run ios` | Start and open on iOS |
| `npm run web` | Start and open in the browser |
| `npx tsc --noEmit` | Type-check |

## Project structure

```
app/                    Expo Router routes
  _layout.tsx           Root stack + AuthProvider
  index.tsx             Redirects to /login or /patient/home
  login.tsx             Sign-in (email, phone code, QR)
  patient/
    (tabs)/             Home · Appointments · Queue · Results · More
    appointments/       Detail and booking
    results/ prescriptions/ invoices/ profile/
    documents.tsx  notifications.tsx
components/             Shared UI (ui.tsx primitives, StatusBadge, QrScanner, …)
lib/
  api.ts                Fetch wrapper: Bearer auth, refresh token rotation, errors
  auth.tsx              Session state and sign-in/sign-out
  storage.ts            Tokens in SecureStore, device id
  push.ts               Device registration and notification → screen routing
  documents.ts          Authenticated document download and share
  events.ts             In-app "data changed" bus for refetching
  theme.ts  types.ts  format.ts  config.ts
```

The `@/` import alias points to the project root.

## How it works

- **Auth.** Sign-in returns a 7-day access token and a 60-day single-use refresh token. Both are kept in SecureStore only. `lib/api.ts` refreshes the access token shortly before it expires. Refreshes are single-flight, so parallel requests can't spend the same refresh token twice. If the refresh is rejected, the app signs out and shows "session expired".
- **Sign-out** revokes this device's session on the server. "Sign out everywhere" revokes all sessions and tells the user if the server couldn't be reached.
- **Patient data is PHI.** Documents are downloaded with the Bearer header into a cache folder. That folder is emptied before each download and on sign-out. Document URLs are never opened in a browser.
- **Refreshing data.** Mutations and incoming pushes emit topics (`appointments`, `lab-results`, `queue`, …) through `lib/events.ts`. Screens subscribe with `useRefreshOn` and refetch.

## Development notes

- Expo SDK 57 changed several APIs. Check the [versioned docs](https://docs.expo.dev/versions/v57.0.0/) before writing code (see `AGENTS.md`).
- Deep-link scheme: `myclinicsoft://`.
- Camera permission is used only for scanning the login QR code. Photo library permission is used only for the profile picture.
