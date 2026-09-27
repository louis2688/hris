# @hris/mobile

Expo (SDK 57, expo-router) app for employees and approvers. Talks to the web app's bearer API at `/api/v1` and imports `@hris/shared` from source.

Tabs: Home, Attendance (clock in/out + DTR), Leave, Approvals (managers, HR, admins), Profile.

## Run it

```bash
pnpm install                                   # from the repo root
pnpm --filter @hris/web dev                    # API on :3000 (or use the deployed URL)
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 pnpm dev:mobile
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS).

- `EXPO_PUBLIC_API_URL` defaults to `http://localhost:3000`, which only works in a simulator on the same machine. On a phone, use your computer's LAN IP (phone and computer on the same Wi-Fi) or the Vercel URL, e.g. `https://hris.example.com`.
- You can also put it in `apps/mobile/.env` (`EXPO_PUBLIC_API_URL=...`). Restart `expo start` after changing it.
- Seed login: `admin@hris.local` / `Password123!`.

Typecheck: `pnpm --filter @hris/mobile typecheck`.

## Clock in / out

1. Face ID / fingerprint prompt if the phone has one enrolled (local check only, the server never sees it).
2. POST `/api/v1/attendance/today`. If the attendance policy needs a selfie (`PHOTO_REQUIRED`) the front camera opens and a ~320px JPEG is sent; if it needs location (`LOCATION_REQUIRED`) the app asks for it and retries.
3. If the policy requires a passkey (`PASSKEY_REQUIRED`), mobile can't punch: the app shows the server's message. Use the web app, or turn that policy off, until mobile gets its own verified method.

## EAS builds

```bash
npm i -g eas-cli && eas login
cd apps/mobile && eas build:configure          # creates eas.json, links the project
eas build -p android --profile preview         # installable APK
eas build -p ios                               # needs an Apple developer account
```

Set `EXPO_PUBLIC_API_URL` per profile under `build.<profile>.env` in `eas.json` (use HTTPS: release builds block plain HTTP). Change `ios.bundleIdentifier` / `android.package` in `app.json` before the first store build. EAS detects the pnpm workspace on its own; run builds from `apps/mobile`.
