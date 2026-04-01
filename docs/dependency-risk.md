# Dependency and Deprecation Risk Snapshot

Date: April 1, 2026

## Commands Run

Root app:

- `npm ci`
- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm ls @xmldom/xmldom`
- `npm explain @xmldom/xmldom`
- `npm ls inflight rimraf glob`

Backend proxy:

- `npm --prefix backend-proxy ci`
- `npm --prefix backend-proxy audit --json`
- `npm --prefix backend-proxy audit --omit=dev --json`
- `npm --prefix backend-proxy ls node-domexception`
- `npm explain node-domexception --prefix backend-proxy`

## Current Risk Surface

### Root app (`/`)

- Audit result (full): `0` advisories.
- Audit result (`--omit=dev`): `0` advisories.
- Direct dependency advisories: none.
- Transitive advisories: none after override fix.
- Dev-only advisories: none reported by audit.

Deprecation warnings seen on install:

- `inflight@1.0.6`
- `rimraf@3.0.2`
- `glob@7.2.3`

Classification:

- Direct deprecation warnings: none.
- Transitive deprecation warnings: yes.
- Runtime relevance: mostly build/dev tooling paths under Expo/React Native dependency trees, but they still appear in standard `npm ci` output because those trees are transitive from root production dependencies.

### Backend proxy (`/backend-proxy`)

- Audit result (full): `0` advisories.
- Audit result (`--omit=dev`): `0` advisories.
- Direct dependency advisories: none.
- Transitive advisories: none.
- Dev-only advisories: none.

Deprecation warning seen on install:

- `node-domexception@1.0.0` (via `openai -> formdata-node`)

Classification:

- Direct deprecation warnings: none.
- Transitive deprecation warnings: yes.
- Runtime relevance: runtime-relevant to proxy dependency graph, but currently no audit advisory and no proxy smoke-test regression.

## Root High-Severity Issue Trace and Fix

Issue observed before fix:

- Advisory: `GHSA-wh4c-j3r5-mjhp`
- Package: `@xmldom/xmldom`
- Affected range: `<0.8.12`
- Installed version before fix: `0.8.11`

Concrete chain:

- `expo@54.0.33 -> @expo/cli@54.0.23 -> @expo/plist@0.4.8 -> @xmldom/xmldom@0.8.11`
- also: `expo@54.0.33 -> @expo/config-plugins@54.0.4 -> xcode@3.0.1 -> simple-plist@1.3.1 -> plist@3.1.0 -> @xmldom/xmldom@0.8.11`

Resolution applied in this repo:

- Added root override: `@xmldom/xmldom: ^0.8.12`
- Lockfile updated to `@xmldom/xmldom@0.8.12`
- Re-ran both root audits: now `0` advisories.

Why this is low risk:

- Same package family, patch-level update within existing semver expectations (`^0.8.8`).
- No framework or architecture upgrade required.
- Full release gate still passes after change.

## Consciously Deferred Items

1. Root deprecation chain (`inflight`/`rimraf@3`/`glob@7`)

- Why deferred:
  - Transitively anchored through Expo/React Native toolchain paths.
  - Forcing broad churn to silence warnings risks destabilizing the release branch.
- Likely future resolution path:
  - Handle in a dedicated Expo SDK / React Native upgrade branch and re-triage with full validation.

2. Proxy deprecation (`node-domexception@1.0.0`)

- Why deferred:
  - Transitive via `openai -> formdata-node`.
  - No active audit advisory and no functional smoke-test failures.
- Likely future resolution path:
  - Re-evaluate during planned `openai` dependency major/minor upgrade window with proxy smoke + app integration checks.

## Release-Branch Rule

- Keep dependency fixes targeted and low-risk.
- Do not run broad `npm audit fix` across Expo/React Native toolchain in this branch.
- Always validate with `npm run verify:all` after dependency changes.
