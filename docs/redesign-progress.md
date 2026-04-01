# Redesign Progress

Last updated: April 1, 2026
Current phase: QA handoff and release-gate documentation pass complete

## Phase 8 - QA Handoff and Release-Gate Documentation (April 1, 2026)

### Goals completed

- Rewrote `docs/manual-qa-checklist.md` into a structured manual/device QA runbook with:
  - explicit scenario IDs
  - risk priority labels (`P0`/`P1`/`P2`)
  - per-scenario steps, expected results, and failure criteria
  - startup/provider/thread/search/knowledge/accessibility coverage.
- Added `docs/release-candidate-checklist.md` to separate:
  - automated gate (`npm run verify:all`)
  - Gate A (`P0` scenarios)
  - Gate B (`P0 + P1` scenarios)
  - deferred-risk signoff requirements.
- Updated release-facing docs (`README`, architecture overview, cloud setup doc) so QA handoff and release-gate expectations are explicit and consistent.
- Kept this phase strictly documentation/release-prep focused; no product redesign/runtime behavior changes.

### What is already validated vs still runtime-dependent

Validated by code/tests:

- root + proxy automated gate via `npm run verify:all`
- deterministic helper/service coverage across turn lifecycle, history/jump, provider/lifecycle mapping, post-processing degrade behavior, and proxy smoke behavior.

Still requiring real runtime/device verification:

- speech input behavior across iOS/Android permissions and failure paths
- provider switching and startup-route truthfulness under real network/proxy conditions
- long-thread history loading and search-to-thread jump/highlight behavior in live runtime
- accessibility quality checks (VoiceOver, Dynamic Type, Reduced Motion, dark-mode readability).

### Major design/engineering decisions

- Keep release-prep docs truthful and operational, not optimistic.
- Make QA execution reproducible for a new tester with no prior project context.
- Keep `verify:all` as the practical automated release gate; add manual gate documentation rather than changing CI.

### Changed files

- `docs/manual-qa-checklist.md`
- `docs/release-candidate-checklist.md` (new)
- `README.md`
- `docs/architecture-overview.md`
- `docs/cloud-provider-setup.md`
- `docs/redesign-progress.md`

### Validation

Commands run:

- `npm run verify:all`

Results:

- release gate remains green (`verify:all`)
- app deterministic tests pass
- proxy verify/smoke tests pass
- install-time transitive deprecation warnings remain visible and tracked in `docs/dependency-risk.md` (unchanged in this phase)

### Manual QA in this environment

- Runtime simulator/device QA was not feasible in this CLI environment.
- This phase intentionally prepared the runbook/checklists for human-run manual QA; no runtime QA claims are made here.

### Known issues / remaining risks

- Manual/device QA execution is still outstanding; release confidence remains blocked on Gate A and Gate B completion by a human tester.
- Thread and Settings remain the largest runtime-risk surfaces despite improved maintainability.
- Transitive deprecation warnings remain accepted release-branch debt and are documented in `docs/dependency-risk.md`.

### Notes next phase must respect

- Treat `docs/manual-qa-checklist.md` as the canonical runtime QA runbook.
- Use `docs/release-candidate-checklist.md` for formal Gate A / Gate B signoff.
- Keep docs truthful about what is and is not runtime-validated.
- Preserve `npm run verify:all` as automated release gate.

## Phase 7 - Final Thread + Settings Maintainability Pass (April 1, 2026)

### Goals completed

- Audited remaining density in `app/thread/[id].tsx` and `app/(tabs)/settings.tsx` and targeted only deterministic, low-risk cleanup points.
- Added `resolveThreadInteractionState` in `thread_ui_state_utils` to centralize Thread interaction gating and UI-state derivation for:
  - provider unavailable state
  - send disablement
  - retry disablement
  - load-older blocking
  - composer placeholder + status labels.
- Updated `app/thread/[id].tsx` to consume the centralized Thread interaction state, removing duplicated local gating expressions while preserving behavior.
- Added `deriveInstalledModelInventory` + `getMissingModelWarningMessage` in `settings_lifecycle_utils` to centralize Settings model inventory derivation and missing-file warning copy.
- Updated `app/(tabs)/settings.tsx` to consume centralized model inventory derivation and removed unused local state (`missingInstalledModelIds`), reducing render-time lifecycle duplication.
- Added deterministic tests for the new helper logic to keep this cleanup regression-safe.

### Major design/engineering decisions

- Keep this pass narrowly focused on maintainability and state clarity, not visible redesign.
- Prefer pure helper extraction + wiring over orchestration rewrites in runtime-heavy screens.
- Preserve existing lifecycle/runtime behavior exactly and verify with release-gate commands.

### Changed files

- `app/thread/[id].tsx`
- `app/(tabs)/settings.tsx`
- `src/services/thread_ui_state_utils.ts`
- `src/services/settings_lifecycle_utils.ts`
- `tests/thread_ui_state_utils.test.mjs`
- `tests/settings_lifecycle_utils.test.mjs`
- `docs/redesign-progress.md`

### Validation

Commands run:

- `npm run typecheck`
- `npm test -- tests/thread_ui_state_utils.test.mjs tests/settings_lifecycle_utils.test.mjs`
- `npm run verify:all`

Results:

- typecheck passes
- deterministic suite passes (`209` tests)
- proxy verify/smoke passes (`23` tests)
- release gate remains green (`verify:all`)

### Manual QA in this environment

- Runtime simulator/device QA was not feasible in this CLI environment.
- Deferred human verification checklist for touched flows:
  - Thread: send, retry AI, provider failure banner, load older messages, rename thread
  - Thread deep-link: open from Search and verify jump/highlight behavior
  - Settings: provider switch, install/activate/delete/fallback/missing-file flows

### Known issues / remaining risks

- Thread and Settings are now cleaner in deterministic UI-state derivation, but they remain the highest runtime-risk screens and still require device-level QA.
- Speech input behavior and provider-switch timing should be verified on physical devices/simulators due platform/runtime variability.
- Existing transitive dependency deprecation warnings remain tracked in `docs/dependency-risk.md` (unchanged in this phase).

### Notes next phase must respect

- Keep `thread_ui_state_utils` and `settings_lifecycle_utils` as the source of truth for newly centralized UI-state derivations.
- Avoid reintroducing duplicated gating/copy logic directly in `app/thread/[id].tsx` and `app/(tabs)/settings.tsx`.
- Preserve `npm run verify:all` as the release gate.

## Phase 6 - Dependency and Documentation Truthfulness (April 1, 2026)

### Goals completed

- Audited real dependency risk for both root app and backend proxy with registry-backed audits and install-time deprecation checks.
- Traced the root high-severity advisory chain concretely (`@xmldom/xmldom@0.8.11` via Expo dependency tree).
- Applied a low-risk, contained fix:
  - root `overrides` now pins `@xmldom/xmldom` to `^0.8.12`
  - lockfile updated to `@xmldom/xmldom@0.8.12`
  - root full and runtime-only audits now both report `0` advisories.
- Added explicit dependency-risk documentation with evidence, classification, and deferred-item rationale.
- Updated README dependency section to match current reality and link to the detailed risk snapshot.

### Major design/engineering decisions

- Keep dependency hardening targeted and low risk (override + lock update), avoiding broad framework/toolchain churn.
- Keep `verify:all` as release gate and do not change CI shape in this phase because it already mirrors intended validation.
- Treat remaining deprecation warnings as tracked ecosystem constraints, not silent debt.

### Changed files

- `package.json`
- `package-lock.json`
- `README.md`
- `docs/architecture-overview.md`
- `docs/dependency-risk.md` (new)
- `docs/redesign-progress.md`

### Validation

Commands run:

- `npm ci`
- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm --prefix backend-proxy ci`
- `npm --prefix backend-proxy audit --json`
- `npm --prefix backend-proxy audit --omit=dev --json`
- `npm run verify`
- `npm run test:proxy`
- `npm run verify:all`

Results:

- root audits: `0` advisories (full + runtime-only)
- proxy audits: `0` advisories (full + runtime-only)
- root install still emits known transitive deprecations (`inflight`, `rimraf@3`, `glob@7`)
- proxy install still emits known transitive deprecation (`node-domexception`)
- all validation gates pass (`verify`, `test:proxy`, `verify:all`)
- note: proxy smoke tests require local loopback bind permissions in this environment; non-escalated runs may fail with sandbox `EPERM` on `127.0.0.1`.

### Manual QA in this environment

- This phase touched dependency metadata and documentation only (no runtime/product surface changes).
- Runtime simulator/device QA was not feasible in this CLI environment.
- Conceptual/manual checks completed:
  - confirmed no product-surface code paths were changed as part of dependency/doc updates
  - confirmed release-gate commands still pass after dependency override change.
- Human runtime QA still required before release for previously deferred Thread/Settings/on-device flows (unchanged from prior phases).

### Known issues / remaining risks

- Install-time deprecation warnings remain transitive:
  - root: `inflight@1.0.6`, `rimraf@3.0.2`, `glob@7.2.3`
  - proxy: `node-domexception@1.0.0`
- These are currently ecosystem-pinned enough to defer in release branch; see `docs/dependency-risk.md` for exact chains and upgrade path.

### Notes next phase must respect

- Keep dependency updates release-safe and targeted; avoid broad `npm audit fix` churn in this branch.
- Preserve `verify:all` as practical release gate.
- Use `docs/dependency-risk.md` as the dependency/deprecation source of truth and update it whenever risk posture changes.

## Phase 5 - Release-Candidate Hardening (April 1, 2026)

### Goals completed

- Audited remaining regression-risk helpers across turn lifecycle, history merge/jump behavior, settings lifecycle gating, and interaction-feedback utilities.
- Added deterministic regression tests for high-value failure and edge paths:
  - assistant turn provider-resolution and assistant-persist failure isolation
  - history snapshot de-duplication and merge-count normalization
  - settings provider switch locking + local missing-model feedback
  - interaction-feedback duration/haptic reduced-motion edge handling.
- Performed a minimal dead-code cleanup by removing the unused legacy color bridge (`src/constants/Colors.ts`) and its unused `toLegacyColors` export path in `src/theme/theme.ts`.
- Kept release-gate workflow unchanged (`verify:all`) and confirmed proxy smoke coverage still aligns with app expectations.

### Major design/engineering decisions

- Keep deterministic service/helper tests as the primary confidence signal; avoid introducing flaky UI automation in this phase.
- Keep CI lightweight and unchanged because it already mirrors the intended release gate (`npm run verify:all`).
- Preserve existing validation visibility (including known proxy install deprecation warning) instead of suppressing warnings globally.

### Changed files

- `tests/assistant_turn_utils.test.mjs`
- `tests/thread_history_utils.test.mjs`
- `tests/settings_lifecycle_utils.test.mjs`
- `tests/interaction_feedback_utils.test.mjs`
- `src/theme/theme.ts`
- `src/constants/Colors.ts` (removed)
- `docs/redesign-progress.md`

### Validation

Commands run:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Results:

- all commands pass
- deterministic suite passes (`205` tests)
- proxy verify/smoke suite passes (`23` tests)
- release gate remains green (`verify:all`)

### Manual QA in this environment

- Runtime simulator/device QA was not feasible in this CLI environment.
- Deferred focused checklist for serious QA handoff:
  - thread send/retry/provider-banner/speech/load-older/search-jump
  - settings provider switch + model install/activate/delete/fallback
  - onboarding model selection/download/retry/success
  - feed/brain/search/spaces empty/loading/error consistency under real device conditions

### Known issues / remaining risks

- Final confidence still depends on on-device manual QA across Thread and Settings lifecycle flows.
- `npm --prefix backend-proxy ci` continues to emit a known transitive deprecation warning (`node-domexception`), already triaged as ecosystem-constrained.
- Thread and Settings remain large runtime surfaces; helper coverage is stronger, but runtime UX still needs device-level verification.

### Notes next phase must respect

- Keep `npm run verify:all` as the practical release gate.
- Preserve provider/model lifecycle truthfulness and thread failure-handling semantics.
- Prefer focused helper/test updates over broad runtime rewrites unless a real regression is found.

## Phase 4 - Final Polish and Release Feel (April 1, 2026)

### Goals completed

- Audited current interaction feedback coverage and tightened consistency where feedback was missing or subtle:
  - manual refresh actions across Feed/Settings/Spaces/Space detail now provide light tactile feedback
  - edit/options toggles and model-selection taps now provide restrained selection feedback
  - retry actions in Search/Thread history now provide explicit interaction feedback.
- Improved accessibility and readability in shared primitives (system-wide impact):
  - `InlineBanner` now includes semantic iconography + alert/live-region semantics
  - `StatusChip` now has explicit accessibility labels and stronger non-color differentiation
  - `StateViews` now expose stronger accessible semantics for loading/empty/error states
  - `AppButton`, `SearchField`, and `ListRow` now use improved hit slop and richer accessibility labeling.
- Polished critical icon-only interactions for tap comfort and VoiceOver clarity:
  - header refresh/edit/options touch targets are larger and include busy/selected states where appropriate
  - thread composer controls (`language`, `mic`, `send`) now use larger targets with explicit accessibility state.
- Tightened microcopy for edge failures so wording stays calm and actionable:
  - rename/delete/create failures across Spaces/Space detail/Thread/Settings now use less technical, user-facing language
  - onboarding install and retry wording is clearer during interruption and recovery.
- Preserved runtime/lifecycle logic and non-regression guarantees while improving polish only.

### Major design/runtime decisions

- Apply polish primarily through shared primitives to avoid screen-by-screen one-off styling drift.
- Keep haptics restrained and intent-based (manual actions, retries, confirmations), while preserving existing success/failure lifecycle feedback.
- Improve accessibility by adding semantics and target comfort instead of reworking navigation or lifecycle flows.
- Keep all provider/model/thread lifecycle behavior unchanged in this phase; focus on clarity and feedback quality.

### Changed files

- `src/components/ui/AppButton.tsx`
- `src/components/ui/InlineBanner.tsx`
- `src/components/ui/ListRow.tsx`
- `src/components/ui/SearchField.tsx`
- `src/components/ui/StateViews.tsx`
- `src/components/ui/StatusChip.tsx`
- `src/components/CaptureFAB.tsx`
- `src/components/thread/ThreadComposer.tsx`
- `app/thread/[id].tsx`
- `app/(tabs)/feed.tsx`
- `app/(tabs)/search.tsx`
- `app/(tabs)/spaces.tsx`
- `app/(tabs)/brain.tsx`
- `app/(tabs)/settings.tsx`
- `app/space/[id].tsx`
- `app/space/new.tsx`
- `app/onboarding/model-selection.tsx`
- `app/onboarding/download.tsx`
- `docs/manual-qa-checklist.md`
- `docs/redesign-progress.md`

### Validation

Commands run:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Results:

- all commands pass
- deterministic tests remain green after shared accessibility/feedback updates
- release gate remains green (`verify:all`, including proxy smoke)

### Manual QA in this environment

- Runtime simulator/device QA was not feasible in this CLI environment.
- Deferred focused checklist for this phase:
  - thread send/retry/provider-banner flow with updated composer controls
  - spaces/space-detail CRUD flows with updated alerts and icon-button targets
  - settings refresh/provider switch/model actions with updated tactile feedback
  - onboarding model selection/download retry wording and action comfort
  - VoiceOver pass for status chips, inline banners, and icon-only header actions
  - Reduced Motion pass for interaction readability without animation dependence

### Known issues / remaining risks

- Haptic behavior is intentionally light; perceived strength can vary across devices and should be tuned on hardware QA.
- VoiceOver phrasing should be validated with localization and longer dynamic-type text sizes.
- Thread/Settings remain large runtime surfaces; polish improved clarity, but full release confidence still depends on on-device scenario QA.

### Notes next phase must respect

- Keep lifecycle truthfulness and provider/model behavior unchanged while tuning polish.
- Preserve existing helper-driven state logic (thread/history/search/settings) and avoid reintroducing one-off style/state paths.
- Keep `verify:all` as the final release gate.

## Phase 3 - Cross-Surface Coherence Polish (April 1, 2026)

### Goals completed

- Audited consistency gaps across Brain, Feed, Search, Spaces, and space detail:
  - list rhythm and row hierarchy mismatch
  - mixed metadata density and copy tone
  - inconsistent summary/status treatment across list headers
  - one-off state booleans in Search that made stale-result behavior harder to reason about
- Polished Search as a stronger native-feeling retrieval surface:
  - added deterministic UI-state derivation helper (`search_ui_state_utils.ts`)
  - simplified error action treatment (`Retry` in banner, explicit `Clear`)
  - improved section/result metadata hierarchy, especially for message hits (snippet + thread + role/time)
  - preserved debounce, stale-result suppression, retry, clear, and search-to-thread jump routing.
- Polished Feed as a higher-signal timeline using shared primitives more consistently:
  - moved event presentation to `ListRow` + `StatusChip` hierarchy
  - preserved reminder done/canceled flows and action gating
  - added concise feed summary chips (`updates`, `open reminders`).
- Polished Spaces and space detail for clearer browsing hierarchy:
  - added thread-count context to space rows
  - added summary chips in Spaces and space-detail headers
  - improved space-detail thread row readability with summary text + summary metadata
  - preserved create/open/rename/delete flows and edit-mode behavior.
- Polished space creation screen to align with grouped-surface system:
  - switched to `GroupedSection` form treatment
  - added explicit cancel action for safer modal flow.
- Added deterministic test coverage for newly extracted Search UI-state behavior.

### Major design/runtime decisions

- Prefer incremental coherence upgrades using existing primitives instead of introducing new visual systems.
- Keep routing and lifecycle logic stable while tightening presentation hierarchy and state readability.
- Treat Search UI-state decisions as deterministic helper logic (testable) to avoid stale-results regressions.
- Keep Spaces as structured list-first navigation with explicit edit mode and visible action affordances.

### Changed files

- `app/(tabs)/brain.tsx`
- `app/(tabs)/feed.tsx`
- `app/(tabs)/search.tsx`
- `app/(tabs)/spaces.tsx`
- `app/space/[id].tsx`
- `app/space/new.tsx`
- `src/repositories/thread_repo.ts`
- `src/services/search_ui_state_utils.ts` (new)
- `tests/search_ui_state_utils.test.mjs` (new)
- `docs/redesign-progress.md` (phase log updated)

### Validation

Commands run:

- `npm run typecheck`
- `npm run verify:all`

Results:

- both commands pass
- root deterministic test suite now includes Search UI-state regression coverage
- release gate remains green (`verify:all`, including proxy smoke)

### Manual QA in this environment

- Runtime simulator/device QA was not feasible in this CLI environment.
- Deferred focused checklist for this phase:
  - Brain load / empty / error states
  - Feed load / empty / error states
  - reminder done/canceled action flows
  - Search query / retry / clear / no-results states
  - quick successive query behavior (stale-result suppression)
  - open message hit -> land in correct thread jump/highlight context
  - Spaces create/open/rename/delete flows
  - Space detail thread create/open/rename/delete flows

### Known issues / remaining risks

- These surfaces are now more cohesive, but on-device QA is still required for perceived density/tap-target comfort under Dynamic Type settings.
- Spaces/space-detail still rely on modal edit flows that should be checked carefully on smaller screens.
- Feed row trailing metadata/chips should be verified on narrow widths and longer localized strings.

### Notes next phase must respect

- Keep search-to-thread message jump behavior and stale-result suppression semantics unchanged.
- Preserve reminder done/canceled behavior and action-state reliability in Feed.
- Preserve spaces/thread CRUD semantics and edit-mode safety constraints.
- Keep using shared primitives and semantic tokens; avoid reintroducing one-off card patterns.
- End next phase with `npm run verify:all` and explicit manual QA evidence or deferral.

## Phase 2 - Settings + Lifecycle Hardening (April 1, 2026)

### Goals completed

- Audited `app/(tabs)/settings.tsx` density and split core concerns into clearer boundaries:
  - provider status and switch rendering
  - local model summary/fallback rendering
  - per-model lifecycle row actions
  - install/activate/delete success-message mapping
- Extracted reusable Settings presentational components:
  - `SettingsProviderCard`
  - `SettingsActiveModelCard`
  - `SettingsModelCard`
- Added lifecycle-focused derivation helpers in `settings_lifecycle_utils.ts` for:
  - provider status tone mapping
  - model status tone mapping
  - local active/fallback summary copy
  - delete-model success outcome copy
- Improved onboarding clarity for model selection and download/progress:
  - clearer lifecycle hierarchy and next-step copy
  - explicit storage/battery messaging
  - tighter install-progress and retry/back wording
- Tightened startup truthfulness logging in `app/index.tsx` by including explicit provider detail code + trace in unavailable logs.

### Major design/runtime decisions

- Keep lifecycle semantics unchanged:
  - Settings installs models without implicit provider/model switch.
  - Activate/set-fallback remains explicit.
  - Delete-active-model fallback behavior remains deterministic through `ModelManager`.
- Keep cloud-unavailable and local-missing-file states visibly actionable rather than hidden behind cleaner visuals.
- Prefer extracted, testable lifecycle copy derivation over ad-hoc alert/message strings in screen handlers.

### Changed files

- `app/(tabs)/settings.tsx`
- `app/onboarding/model-selection.tsx`
- `app/onboarding/download.tsx`
- `app/index.tsx`
- `src/services/settings_lifecycle_utils.ts`
- `src/components/settings/SettingsProviderCard.tsx` (new)
- `src/components/settings/SettingsActiveModelCard.tsx` (new)
- `src/components/settings/SettingsModelCard.tsx` (new)
- `tests/settings_lifecycle_utils.test.mjs`
- `docs/redesign-progress.md` (phase log updated)

### Validation

Commands run:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Results:

- all commands pass
- hardening tests increased for lifecycle helper coverage (`settings_lifecycle_utils`)
- release gate remains green (root verify + proxy verify)

Manual QA in this environment:

- Runtime simulator/device QA was not feasible in this CLI environment.
- Deferred focused lifecycle checklist for this phase:
  - onboarding with no model installed
  - install model
  - activate model
  - delete active model
  - missing local file state
  - switch to cloud when healthy
  - cloud unavailable state
  - startup truthfulness after lifecycle changes

### Known issues / remaining risks

- `app/(tabs)/settings.tsx` is cleaner but still orchestration-heavy; further extraction should focus on lifecycle coordination hooks, not superficial splitting.
- On-device validation is still required for install/download timing and provider-switch UX under active thread load.
- Startup + settings messaging is aligned at copy level, but edge behavior still depends on real proxy/network conditions and must be manually exercised.

### Notes next phase must respect

- Preserve lifecycle truthfulness over visual simplicity.
- Do not reintroduce implicit auto-switch semantics during install/download paths.
- Keep cloud/local status reasons and traceability visible but concise.
- Keep `verify:all` green at phase boundary and update this file with exact QA evidence/defer notes.

## Phase 1 - Thread Flagship Hardening (April 1, 2026)

### Goals completed

- Audited `app/thread/[id].tsx` density and separated key concerns:
  - runtime orchestration (turn execution, post-processing queue, provider retry)
  - history/jump handling
  - provider/banner rendering
  - composer/speech controls
  - rename modal rendering
- Extracted high-value presentational pieces from the thread screen without changing lifecycle semantics.
- Moved Thread from legacy `Colors` usage to semantic theme-driven rendering.
- Added deterministic UI-state helpers for thread status/placeholder/history controls.
- Added deterministic test coverage for new Thread UI-state helpers and a jump edge case.

### Major design/runtime decisions

- Keep `executeAssistantTurn` + stage model (`assistant_turn_utils.ts`) as-is; do not redesign turn architecture.
- Keep `thread_history_utils.ts` as the source of truth for jump/pagination behavior; thread screen consumes it.
- Improve maintainability by extracting UI-only pieces:
  - provider banner
  - history/jump header
  - composer
  - rename modal
- Keep failure behavior explicit:
  - provider failures remain actionable (`Retry AI` + `Open Settings`)
  - fallback assistant message behavior remains intact
  - post-processing remains asynchronous and isolated from visible reply persistence
- Add defensive fallback if `executeAssistantTurn` unexpectedly throws, to avoid loading-state lockups.

### Changed files

- `app/thread/[id].tsx`
- `src/components/thread/ThreadMessageBubble.tsx`
- `src/components/thread/ThreadProviderBanner.tsx` (new)
- `src/components/thread/ThreadHistoryHeader.tsx` (new)
- `src/components/thread/ThreadComposer.tsx` (new)
- `src/components/thread/ThreadRenameModal.tsx` (new)
- `src/services/thread_ui_state_utils.ts` (new)
- `tests/thread_ui_state_utils.test.mjs` (new)
- `tests/thread_history_utils.test.mjs`
- `docs/redesign-progress.md` (phase log updated)

### Validation

Commands run:

- `npm run typecheck`
- `npm test`
- `npm run verify:all`

Results:

- all three commands pass
- `verify:all` confirms root hardening + proxy smoke flow remain green after Thread refactor/extractions
- test count increased with new Thread UI-state tests and all hardening tests remain green

Manual QA in this environment:

- Runtime simulator/device QA was not feasible in this CLI environment.
- Deferred focused checklist for this phase:
  - normal send success
  - provider failure banner visibility and wording
  - `Retry AI` behavior while idle vs while turn active
  - load older messages during idle and blocked states
  - search-to-thread jump/highlight behavior
  - rename thread flow (saving state + validation)
  - speech start/stop happy path and microphone-permission failure path

### Known issues / remaining risks

- `app/thread/[id].tsx` is materially cleaner but still large; further extraction should prioritize orchestration helpers, not visual churn.
- Speech/event flows still depend on native module timing and need on-device QA confidence before release.
- FlashList behavior under very long histories and rapid navigation remains a practical runtime risk area.

### Notes next phase must respect

- Keep Thread stage/retry/history semantics stable; only tighten clarity and reliability.
- Do not regress search-to-thread deep-link jump behavior.
- Preserve both provider paths and provider failure recovery affordances.
- Keep `verify:all` green at phase boundary and update this file with exact QA evidence/defer notes.

## Phase Goals Completed

- Audited current implementation against `docs/redesign-plan.md`.
- Documented what redesign foundations are already landed vs still incomplete.
- Identified highest-risk remaining redesign/runtime surfaces.
- Created this durable handoff file for auto-chained subsequent phases.
- Applied a minimal status-alignment update to `docs/redesign-plan.md`.

## Major Decisions In This Phase

- Treat Thread hardening as the next highest-priority redesign/runtime phase.
- Keep Settings/onboarding lifecycle semantics stable; prioritize extraction/clarity over broad rewrites.
- Keep Search as a first-class top-level surface while tightening coherence with Brain/Feed.
- Preserve `npm run verify:all` as the phase-by-phase release gate.

## Changed Files In This Phase

- `docs/redesign-progress.md` (new)
- `docs/redesign-plan.md` (minimal status checkpoint + resolved tab-order note)

## Current Repo State

- `docs/redesign-plan.md` exists and is still the source redesign strategy.
- Semantic theming is in place via `src/theme/theme.ts`.
- Shared UI primitives are in place under `src/components/ui`.
- Interaction feedback helpers (reduced motion + haptics/layout feedback) are in place.
- Full validation baseline currently passes (`npm run verify:all`).

## What Is Already Landed

### Foundation and shell

- Theme token layer implemented (`src/theme/theme.ts`) with light/dark semantic roles.
- Legacy color bridge removed; semantic theme tokens are now the single app color source.
- Root and tab shell switched to theme-aware headers/backgrounds (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`).
- Reduced-motion-aware navigation animation toggles are already wired into shell layouts.

### Shared primitives

- Reusable primitives are available and actively used across multiple screens:
  - `ScreenScaffold`
  - `SectionHeader`
  - `GroupedSection`
  - `ListRow`
  - `InlineBanner`
  - `AppButton`
  - `StatusChip`
  - state views (`LoadingStateView`, `EmptyStateView`, `ErrorStateView`)
  - `SearchField`

### Interaction feedback baseline

- Reduced motion handling exists (`useReducedMotion`).
- Subtle layout transition helper exists (`runLayoutFeedback`).
- Haptic helper exists (`triggerHaptic`) with deterministic pattern mapping.
- Deterministic helper tests exist for interaction feedback utility logic.

### Product-surface modernization already started

- Brain/Feed/Search/Settings/Onboarding screens are already partially migrated to shared primitives and semantic theming.
- Manual QA checklist and README were already updated to include motion/haptics/reduced-motion expectations and release-gate validation story.

## Incomplete or Inconsistent Areas

1. Thread screen is still the largest risk surface.
- `app/thread/[id].tsx` is still very large (~1600 lines).
- It still uses legacy `Colors` and custom local styles heavily.
- Runtime orchestration and rendering remain tightly coupled.
- It currently uses only a subset of the shared primitives.

2. Settings remains runtime-dense.
- `app/(tabs)/settings.tsx` is functionally improved but still very large (~900+ lines).
- Provider/model lifecycle logic and presentation are still mixed in one screen module.
- Section rendering patterns are better, but extraction opportunities remain for long-term maintainability.

3. Onboarding is improved but not yet fully systemized.
- `app/onboarding/model-selection.tsx` and `app/onboarding/download.tsx` use primitives but still carry one-off row/card presentation details that are duplicated from Settings patterns.

4. Knowledge-surface coherence is close but not fully unified.
- Brain/Feed/Search all use the design system, but row density, metadata rhythm, and section spacing are still slightly inconsistent.
- Search, Brain, and Feed each still define custom list framing details that can drift over time.

## Highest-Risk Remaining Surfaces (Phase Priority)

1. Thread (`app/thread/[id].tsx`)
- Highest runtime + UX criticality.
- Most coupling between async orchestration and presentation.
- Most likely surface for regression when polishing.

2. Settings + onboarding lifecycle surfaces
- User-trust critical status/lifecycle flows.
- High complexity in provider/model state transitions.
- Messaging/copy consistency must remain tightly aligned with actual lifecycle truth.

3. Brain/Feed/Search coherence
- Lower runtime risk than Thread/Settings, but still high product quality risk.
- Needs final consistency pass for shared hierarchy and predictable state presentation.

## Recommended Remaining Phase Order

1. Thread flagship hardening + presentation extraction
- Reduce rendering/orchestration density in `app/thread/[id].tsx`.
- Keep stage/retry/speech/history/jump behavior unchanged.
- Expand shared presentational subcomponents where they reduce risk.

2. Settings + onboarding lifecycle polish
- Extract highest-value Settings section components.
- Keep provider/model lifecycle semantics explicit and unchanged.
- Align onboarding and settings model-row language/actions.

3. Brain/Feed/Search coherence pass
- Normalize section/list rhythm, metadata hierarchy, and state banners.
- Preserve existing search routing/jump behavior exactly.

4. Final release-candidate polish pass
- Accessibility and reduced-motion confirmation across all touched screens.
- Copy/microcopy consistency sweep.
- Manual QA sweep and remaining debt register.

## Non-Regression Notes For Next Phases

- Do not regress local/cloud provider behavior, startup routing, or model lifecycle semantics.
- Do not regress thread send/retry/speech/load-older/search-jump flows.
- Do not remove provider troubleshooting affordances from thread/settings error states.
- Keep all new visual work on semantic theme + shared primitives; avoid new one-off token islands.
- Preserve `npm run verify:all` as the release gate after each phase.

## Validation For This Phase

Commands run:

- `npm run verify:all`

Result:

- Pass (root verify + proxy verify all green).

Manual QA in this environment:

- Runtime simulator/device QA was not feasible in this CLI environment.
- Deferred checklist for the next implementation phase:
  - thread send/retry/speech/load-older/search-jump
  - settings provider switch + model install/activate/delete
  - onboarding selection/download/activate

## Known Issues / Risks At Handoff

- Thread and Settings modules remain large enough to make regressions easy during further polish.
- Legacy `Colors` usage still exists in critical Thread presentation paths.
- Shared primitives are established, but not yet the sole source for all major-screen row/state structures.

## Next Phase Must Respect

- Start by reading:
  - `docs/redesign-plan.md`
  - this file (`docs/redesign-progress.md`)
  - the exact files named by the next phase prompt
- Fix only minimal blockers first if they would break phase goals.
- End with:
  - `npm run verify:all`
  - focused QA steps (or explicit QA deferral)
  - update this file with decisions, changed files, and remaining risks.
