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
- `test`: deterministic hardening tests (memory/retrieval/extraction/turn-pipeline/provider/status/settings lifecycle/thread-history/model lifecycle helpers)
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
- UI polish baseline includes reduced-motion-aware transitions and restrained haptic feedback on key confidence actions (send success, reminder state changes, provider retry outcomes).
- optional debug logging:
  - app: `SECOND_BRAIN_DEBUG_LOGS=1` (or `EXPO_PUBLIC_DEBUG_LOGS=1`)
  - proxy: `OPENAI_PROXY_DEBUG_LOGS=true`

## Manual Device QA Handoff

Automated checks are necessary but not sufficient for release readiness.

Use both docs below for manual/device signoff:

- runbook with scenario steps + expected/failure criteria: `docs/manual-qa-checklist.md`
- release signoff checklist (Gate A / Gate B): `docs/release-candidate-checklist.md`

Release-candidate decision rule:

1. `npm run verify:all` passes.
2. All `P0` scenarios pass (first serious QA pass).
3. All `P0` + `P1` scenarios pass (beta/release-candidate signoff).
4. Deferred risks are reviewed and explicitly accepted (`docs/dependency-risk.md`, `docs/redesign-progress.md`).

## Redesign Status

- Product/design direction: `docs/redesign-plan.md`
- Phase-by-phase handoff log and current state: `docs/redesign-progress.md`

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

Inspect deprecation chains:

```bash
# root warning chains
npm ls inflight rimraf glob
npm explain inflight
npm explain rimraf
npm explain glob

# proxy warning chain
npm --prefix backend-proxy ls node-domexception
npm --prefix backend-proxy explain node-domexception
```

Safe changes in this repo:

- targeted transitive patch fix in `backend-proxy` via `overrides` (for example `path-to-regexp`)
- patch/minor updates that keep Expo SDK and React Native versions unchanged
- dependency fixes that still pass `npm run verify:all`

Risky changes to defer:

- broad `npm audit fix` churn across Expo/Metro/CLI transitive trees without a full SDK upgrade plan
- upgrades that force Expo SDK, React Native, or major tooling shifts

Current triage status (April 1, 2026):

- `backend-proxy`: 0 known advisories in both full and runtime-only audit.
- root app: 0 known advisories in both full and runtime-only audit after applying a low-risk override for `@xmldom/xmldom` (from `0.8.11` -> `0.8.12`) to address `GHSA-wh4c-j3r5-mjhp`.
- root lockfile now applies low-risk same-major overrides to reduce risk without SDK churn:
  - `@xmldom/xmldom` -> `^0.8.12`
  - `ajv` -> `^8.18.0`
  - `brace-expansion@2.0.2` -> `2.0.3` (scoped override)
  - `node-forge` -> `^1.4.0`
  - `tar` -> `^7.5.11`
  - `undici` -> `^6.24.0`
  - `yaml` -> `^2.8.3`

Deprecation warnings still present (tracked, non-audit):

- direct dependencies with deprecation warnings: none (root + proxy)
- root transitive warnings: `inflight@1.0.6`, `rimraf@3.0.2`, `glob@7.2.3`
  - chains are from Expo/React Native tooling paths (`expo -> @expo/cli -> @react-native/dev-middleware -> chromium-edge-launcher -> rimraf -> glob -> inflight`, plus `react-native -> @react-native/codegen/test tooling -> glob -> inflight`)
  - these are mostly build/dev-tooling paths, but appear in normal install output because they are transitively included in production dependency trees
- proxy transitive warning: `node-domexception@1.0.0` via `openai -> formdata-node`
  - this is runtime-relevant in the cloud proxy path, but currently has no associated audit advisory and no functional regression in smoke coverage

Planned future path:

- avoid broad `npm audit fix` churn in the current release branch
- clear root deprecation chains as part of the next planned Expo SDK / React Native upgrade branch (where upstream toolchain deps can move off `glob@7`/`rimraf@3` cleanly)
- re-evaluate proxy `openai` major upgrades in a dedicated cloud-provider hardening window (with smoke + app integration checks) rather than forcing churn only to reduce install warning text
- re-run `npm audit` + `npm audit --omit=dev` and `npm run verify:all` after each dependency window

Deprecation warning note:

- these warnings are currently accepted for the release branch because they are transitive ecosystem constraints; do not force major framework upgrades just to silence install output.

Detailed evidence (commands, dependency chains, and deferred items) is tracked in `docs/dependency-risk.md`.

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
