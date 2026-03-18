# SecondBrain

SecondBrain is an Expo + React Native app with:

- local on-device model support (`llama.rn`)
- cloud model support via `backend-proxy`
- local-first storage and memory services

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+
- Expo tooling for device/simulator runs

## App Setup

```bash
npm ci
```

Run the app:

```bash
npm start
```

## Root Validation Commands

```bash
npm run typecheck
npm test
npm run verify
```

- `typecheck`: TypeScript checks (`tsc --noEmit`)
- `test`: deterministic hardening tests
- `verify`: top-level safety command (`typecheck` + `test`)

## Backend Proxy Setup

```bash
cd backend-proxy
cp .env.example .env
npm ci
npm start
```

Point the app to the proxy:

- `EXPO_PUBLIC_AI_PROXY_BASE_URL=http://<your-host>:8787`

See:

- `backend-proxy/README.md`
- `docs/cloud-provider-setup.md`

## Bootstrap and DB Initialization

The app bootstrap entry is `app/index.tsx`.

On app startup it:

1. runs DB migrations via `runMigrations()` in `src/db/migrations.ts`
2. checks active provider/model state
3. routes to onboarding, settings, or main tabs accordingly

SQLite DB client is initialized in `src/db/client.ts`.
