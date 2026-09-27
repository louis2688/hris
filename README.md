# HRIS

Human resources management system: employee records (PIM with skills, licenses, memberships), leave with multi-level approvals, time and attendance (DTR, fingerprint / Face ID passkeys, selfie on punch, ZKTeco terminals), timesheets, recruitment, performance reviews, reports with CSV / PDF export, email notifications and an employee self-service portal. Web app now, React Native (Expo) mobile app next, sharing the same API and contracts.

## Stack

| Layer     | Choice                                                            |
| --------- | ----------------------------------------------------------------- |
| Monorepo  | pnpm workspaces + Turborepo                                       |
| Web       | Next.js 16 (App Router, Server Actions), React 19, Tailwind 4     |
| Data      | Postgres on Supabase, Prisma 7 (`@prisma/adapter-pg`)             |
| Auth      | Own JWT (jose) in httpOnly cookie for web, bearer + refresh tokens for mobile, bcrypt passwords |
| Contracts | `@hris/shared` zod schemas and types, consumed by web and mobile  |
| Tests     | Vitest (shared logic), Playwright (web E2E + mobile viewport)     |

```
apps/web            Next.js app: UI, server actions, /api/v1 REST for mobile
packages/db         Prisma schema, migrations, client singleton, seed
packages/shared     zod schemas, enums, leave-day maths (pure, portable)
```

## Roles

| Role     | Can                                                                                    |
| -------- | -------------------------------------------------------------------------------------- |
| EMPLOYEE | View own profile, edit own contact details, request and cancel own leave               |
| MANAGER  | Everything above + see direct reports, approve or reject their leave, team calendar    |
| HR       | Everything above + full employee CRUD, org settings, leave types, entitlements, holidays, file leave on behalf |
| ADMIN    | Everything above + create login accounts, change roles, reset passwords, remove employees |

Rule of thumb enforced server-side: nobody can approve their own request; managers only act on their direct reports; HR and Admin see everyone.

## Setup

Requirements: Node 20+, pnpm 9+ (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install

# 1. Environment
cp .env.example apps/web/.env
cp .env.example packages/db/.env
#    Fill DATABASE_URL / DIRECT_URL with the Supabase connection string
#    (Project Settings -> Database -> Connection string, Session pooler, port 5432)
#    and set AUTH_SECRET:  openssl rand -base64 32

# 2. Database
pnpm db:generate            # prisma client
pnpm db:migrate             # applies packages/db/prisma/migrations (already applied to the Supabase "hris" project)
pnpm db:seed                # org, leave types, PH holidays, 12 demo employees

# 3. Run
pnpm dev                    # http://localhost:3000
```

Demo logins after seeding (password `Password123!`, override with `SEED_PASSWORD`):

| Email                 | Role     |
| --------------------- | -------- |
| admin@hris.local      | ADMIN    |
| hr@hris.local         | HR       |
| manager@hris.local    | MANAGER  |
| employee@hris.local   | EMPLOYEE (reports to manager) |

Change these before anything real goes in.

### Local Postgres instead of Supabase

Any Postgres 14+ works. Point `DATABASE_URL` and `DIRECT_URL` at it and run the same commands.

## Scripts

```bash
pnpm dev / build / typecheck / test
pnpm db:migrate:dev         # create a new migration after editing schema.prisma
pnpm db:studio              # Prisma Studio
pnpm --filter @hris/web test:e2e   # Playwright (needs a built app + seeded DB)
```

## Leave engine

- Working days = calendar days minus weekends minus public holidays (company-wide or the employee's location). Half days (AM / PM) supported per leave type.
- Balance per type per year = entitled + carried over + adjustment - approved - pending.
- Requests are rejected when they overlap an existing pending/approved request, exceed the balance (paid types), or exceed `maxConsecutiveDays`.
- Types with `requiresApproval = false` (e.g. WFH) are approved on submit.
- New hires get the current year's default entitlement for every active leave type automatically. HR can bulk-assign and adjust per person.
- Every state change writes a `LeaveRequestEvent` (timeline on the request page) and an `AuditLog` row; the approver and requester get in-app notifications.

## Mobile API (`/api/v1`)

Bearer auth. Access tokens last 15 min, refresh tokens 30 days and rotate on use.

```
POST /auth/login            { email, password } -> { accessToken, refreshToken, user }
POST /auth/refresh          { refreshToken }    -> rotated pair
POST /auth/logout           { refreshToken }
GET  /me                    profile
PATCH /me                   own contact details (employeeSelfUpdateSchema)
GET  /me/balances?year=
GET  /me/leave?status=&page=
GET  /leave                 requests visible to caller
POST /leave                 create (createLeaveRequestSchema)
GET  /leave/:id
POST /leave/:id/decision    { decision: APPROVED|REJECTED, note? }   manager/HR/admin
POST /leave/:id/cancel      { note? }
GET  /leave-types
GET  /employees             directory scoped to caller
GET  /employees/:id
GET  /team/pending          requests awaiting caller
GET  /notifications  /  POST marks all read
GET  /health
```

Errors: `{ error: { code, message, details? } }` with 401 / 403 / 404 / 409 / 422.

The Expo app should import `@hris/shared` for the request/response schemas and reuse `countLeaveDays` for the live day counter.

## Attendance and biometrics

- Web punch: `/attendance`. Policy (Settings > Attendance) can require a passkey (device fingerprint / Face ID via WebAuthn), a selfie (small JPEG, stored with the punch) and location.
- DTR per month with late, undertime and OT against the employee's work shift (night shifts supported). Print for a signed copy.
- Biometric terminals: add the device in Settings > Attendance, set each employee's Biometric ID to their enroll number on the terminal.
  - ZKTeco (ADMS push): point the device's Cloud Server to `https://<your-app>/iclock` (port 443). Optional `ADMS_ALLOWED_IPS` (comma list) locks the endpoint to your office IPs.
  - Anything else: `POST /api/v1/attendance/device-punches` with header `X-Device-Key` and `{ punches: [{ biometricId, at, direction?, method? }] }`.

## Email

Set `SMTP_URL` (e.g. `smtps://user%40gmail.com:APP_PASSWORD@smtp.gmail.com:465`) and optionally `MAIL_FROM`, `APP_URL`. Every in-app notification is then also emailed. Unset = in-app only. Admins can `POST /api/v1/admin/test-email` to check delivery.

## Deploying

Any Node host works (Vercel, Cloud Run, a VM). Set the env vars (DATABASE_URL, DIRECT_URL, AUTH_SECRET, NEXT_PUBLIC_APP_URL, optional SMTP_URL / MAIL_FROM / APP_URL / ADMS_ALLOWED_IPS), run `pnpm build`, start with `pnpm --filter @hris/web start`. Use the Supabase transaction pooler (port 6543) for `DATABASE_URL` on serverless platforms and keep `DIRECT_URL` on 5432 for migrations.

## Not in this release

Payroll, document uploads, SSO, in-browser face recognition. The schema and service layer are laid out so these are additive modules.

## Integrations

Admins see the status of each one in Settings > Integrations (presence only, secret values are never shown).

**Google / Microsoft sign-in** (OpenID Connect, auth code + PKCE + state + nonce). Nobody is auto-provisioned: a first SSO sign-in links to the ACTIVE user with the same email, later sign-ins match the linked identity. Users can disconnect it under Security. Password sign-in keeps working.

| Env | |
|---|---|
| `APP_URL` | Public base URL, used to build the redirect URIs below |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console > APIs & Services > Credentials > OAuth client (Web). Redirect URI: `<APP_URL>/api/auth/google/callback` |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Entra ID > App registrations (Web platform). Redirect URI: `<APP_URL>/api/auth/microsoft/callback` |
| `MICROSOFT_TENANT_ID` | Your directory (tenant) ID. Default `organizations` (any work account); then only the UPN (`preferred_username`) is trusted for linking. Pin it to also accept the `email` claim |
| `SSO_ALLOWED_DOMAINS` | Optional, e.g. `acme.com,acme.ph`. Limits which email domains can be linked |

A provider's button shows on the login page only when both its id and secret are set.

**Mobile push** (Expo push service). The app registers its Expo push token via `POST /api/v1/devices` after sign-in and removes it on sign-out. Every in-app notification is also pushed unless the user turns push off under Security > Notifications.

- Run `eas init` in `apps/mobile` so `expo.extra.eas.projectId` is in `app.json`; the app skips push without it.
- Optional `EXPO_ACCESS_TOKEN` if you enable enhanced push security in your Expo account.
- Remote push needs a development or store build. Expo Go (SDK 53+) doesn't receive remote push on Android.

Tests: `node --test apps/web/src/server/auth/oidc.test.mjs` (state cookie, PKCE, id_token checks). `e2e/platform.spec.ts` runs a full Google round trip against a local mock provider when the server has `GOOGLE_CLIENT_ID=e2e GOOGLE_CLIENT_SECRET=e2e GOOGLE_ISSUER=http://localhost:3199 APP_URL=<base url>` and the tests get `E2E_MOCK_OIDC_PORT=3199`.
