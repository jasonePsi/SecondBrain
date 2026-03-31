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
npm run setup:proxy
npm run setup:all
npm run verify:all
```

- `typecheck`: TypeScript checks (`tsc --noEmit`)
- `test`: deterministic hardening tests (memory/retrieval/extraction/turn-pipeline/provider utilities + model lifecycle helpers)
- `verify`: app safety command (`typecheck` + `test`)
- `setup:proxy`: installs `backend-proxy` dependencies from repo root
- `setup:all`: convenience alias for repo-wide setup tasks (currently `setup:proxy`)
- `verify:all`: app checks + backend-proxy verification (syntax + smoke tests); self-contained from root after `npm ci`

From a fresh checkout:

```bash
npm ci
npm run verify:all
```

Notes:

- `verify:all` installs backend-proxy dependencies automatically; no manual `cd backend-proxy && npm ci` needed.
- hardening tests keep strict checks and suppress noisy Node warning spam from type-stripping/module-typeless warnings.
- `verify:all` is the intended lightweight release gate and is what CI runs.
- proxy smoke coverage includes health/config checks, invalid JSON/request handling, request-id traceability, and privacy-default behavior for both chat and extract routes.
- optional debug logging:
  - app: `SECOND_BRAIN_DEBUG_LOGS=1` (or `EXPO_PUBLIC_DEBUG_LOGS=1`)
  - proxy: `OPENAI_PROXY_DEBUG_LOGS=true`

## Dependency Maintenance (Release-Safe)

SecondBrain has two dependency surfaces that must be triaged separately:

- root app (`/`)
- cloud proxy (`/backend-proxy`)

Run audit checks:

```bash
# root
npm audit
npm audit --omit=dev

# proxy
npm --prefix backend-proxy audit
npm --prefix backend-proxy audit --omit=dev
```

Safe changes in this repo:

- targeted transitive patch fix in `backend-proxy` via `overrides` (for example `path-to-regexp`)
- patch/minor updates that keep Expo SDK and React Native versions unchanged
- dependency fixes that still pass `npm run verify:all`

Risky changes to defer:

- broad `npm audit fix` churn across Expo/Metro/CLI transitive trees without a full SDK upgrade plan
- upgrades that force Expo SDK, React Native, or major tooling shifts

Current triage status (March 31, 2026):

- `backend-proxy`: 0 known advisories after a targeted `path-to-regexp` override
- root app: remaining advisories are transitive (no direct vulnerable dependencies), mostly in Expo/CLI/Metro/codegen chains; they should be resolved as part of the next planned Expo SDK/toolchain upgrade cycle

Root advisory buckets currently map to:

- `ajv` via `expo-build-properties`
- `node-forge`, `tar`, `undici`, `picomatch` via `expo` / `@expo/cli`
- `yaml` via Expo/Metro config toolchain
- `minimatch`, `brace-expansion` via React Native codegen/build tooling

Planned future path:

- upgrade Expo SDK / React Native toolchain in a dedicated branch
- re-run `npm audit` + `npm audit --omit=dev`
- only after SDK upgrade stabilizes, consider lockfile-wide `npm audit fix` and revalidate with `npm run verify:all`

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
