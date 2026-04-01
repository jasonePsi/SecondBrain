# Manual Device QA Runbook

Last updated: April 1, 2026

This runbook is for real device/simulator QA. It is intentionally strict and release-oriented.

## 0) How To Use This Runbook

1. Run scenarios in the **Recommended Order** section.
2. Record outcome for each scenario: `Pass`, `Fail`, `Blocked`, or `Not Run`.
3. When blocked, capture blocker details (environment, logs, screenshots, repro).
4. Do not mark release-ready unless all required gate scenarios pass.

### Priority and Gate Legend

- `P0` = must-pass for first serious QA pass (**Gate A**)
- `P1` = must-pass for beta/release-candidate signoff (**Gate B**)
- `P2` = nice-to-have confidence checks (non-blocking unless product lead escalates)

### Release Gates

- **Gate A (First serious QA pass):** all `P0` scenarios must pass.
- **Gate B (Beta / Release Candidate):** all `P0` + `P1` scenarios must pass.
- `P2` scenarios are optional but recommended before broad beta.

## 1) Prerequisites and Setup

### PR-01 [P0][Gate A] Clean checkout + validation gate

Steps:
1. From repo root run `npm ci`.
2. Run `npm run verify:all`.
3. Confirm app and proxy tests pass before device QA starts.

Expected result:
- All commands complete successfully.
- `verify:all` is green.

Fail if:
- `verify:all` fails, times out, or is skipped.
- QA begins without passing validation baseline.

### PR-02 [P0][Gate A] Device/runtime matrix declared

Steps:
1. Pick at least one iOS runtime target (simulator or device).
2. Pick at least one Android runtime target for speech/provider parity checks.
3. Record OS version/device target in the test log.

Expected result:
- Runtime coverage is explicit before tests begin.

Fail if:
- Platform coverage is unknown.
- Speech/provider parity checks run only on one platform without rationale.

### PR-03 [P0][Gate A] Cloud QA environment prepared (when testing cloud)

Steps:
1. In `backend-proxy`, set `.env` and start proxy (`npm ci`, `npm start`).
2. Set app env `EXPO_PUBLIC_AI_PROXY_BASE_URL=http://<host>:8787`.
3. Verify proxy health endpoint is reachable.

Expected result:
- Cloud path is testable with a healthy proxy.

Fail if:
- Proxy is unreachable/misconfigured and cloud scenarios are still marked pass.

## 2) Recommended Order

1. `PR-*` setup and baseline verification
2. `ST-*` startup truthfulness
3. `ONB-*` onboarding/model lifecycle
4. `LP-*` local provider runtime
5. `TH-*` thread/send/retry/speech/history
6. `SJ-*` search-to-thread jump/highlight
7. `CP-*` cloud provider/runtime truthfulness
8. `KB-*` Brain/Feed/Search state coherence
9. `AC-*` reminder/action management
10. `AX-*` dark mode/accessibility/reduced motion
11. `P2` stress/polish scenarios

## 3) Startup Truthfulness

### ST-01 [P0][Gate A] Startup routes to onboarding when no usable local model exists

Steps:
1. Start from clean state with local provider selected and no usable local model files.
2. Launch app.

Expected result:
- App routes to onboarding model selection.

Fail if:
- App routes to Spaces/Thread despite no usable local model.
- App shows conflicting provider/model state messaging.

### ST-02 [P0][Gate A] Startup routes to Settings when cloud is selected but unavailable

Steps:
1. Select cloud provider.
2. Stop proxy or point app to unreachable proxy URL.
3. Relaunch app.

Expected result:
- App opens Settings with actionable cloud-unavailable reason.

Fail if:
- App routes to normal tabs despite cloud unavailable.
- Error reason is vague or non-actionable.

### ST-03 [P1][Gate B] Startup local fallback auto-repair behavior

Steps:
1. Configure local provider with missing/invalid active model.
2. Ensure another usable local model exists.
3. Relaunch app.

Expected result:
- Startup activates deterministic fallback local model and routes coherently.

Fail if:
- Startup gets stuck, routes incorrectly, or leaves local active model invalid without actionable state.

## 4) Onboarding and Model Lifecycle

### ONB-01 [P0][Gate A] First-run onboarding flow

Steps:
1. Launch app with no installed model.
2. Inspect model-selection screen defaults and copy.

Expected result:
- One model is selected by default.
- CTA and battery/storage language are understandable.

Fail if:
- No selectable default.
- CTA implies wrong next step.

### ONB-02 [P0][Gate A] Download/install/activate in onboarding

Steps:
1. Select a model not installed.
2. Continue to download/install screen.
3. Let installation complete.

Expected result:
- Progress transitions are clear.
- Model installs and activates.
- App routes to Spaces after success.

Fail if:
- Progress stalls silently.
- Success does not route correctly.
- Installed model is not active after completion.

### ONB-03 [P1][Gate B] Download interruption and retry/back behavior

Steps:
1. Interrupt network or otherwise force install error.
2. Use `Retry`.
3. Use `Back to Model Selection` path.

Expected result:
- Error state is clear and actionable.
- Retry works.
- Back path is available when expected and does not corrupt lifecycle state.

Fail if:
- User is trapped in broken state.
- Retry/back actions are misleading or ineffective.

### ONB-04 [P0][Gate A] Settings lifecycle actions stay truthful

Steps:
1. In Settings Local Models section, run: Install, Use This Model/Set as Fallback, Delete.
2. Repeat once with cloud active and once with local active.

Expected result:
- Install does not silently auto-switch unless flow explicitly says so.
- Activate/fallback actions do exactly what labels promise.
- Delete active model triggers deterministic fallback or clear-active behavior.

Fail if:
- Action labels and behavior diverge.
- Active/fallback state becomes ambiguous or stale.

### ONB-05 [P1][Gate B] Missing-file reconciliation

Steps:
1. Simulate stale install metadata / missing local model file.
2. Open Settings.

Expected result:
- Affected model is shown as `Missing File`.
- Suggested next action (reinstall/select fallback) is explicit.

Fail if:
- Missing file is shown as installed.
- Lifecycle card/badges show conflicting state.

## 5) Local Provider Runtime

### LP-01 [P0][Gate A] Local provider available and selected

Steps:
1. Ensure a usable local model is active.
2. Select `Local (On-device)` provider in Settings.
3. Open Thread and send a short message.

Expected result:
- Thread replies successfully via local provider.
- No cloud-required warning appears.

Fail if:
- Local provider appears active but send fails due to provider mismatch.

### LP-02 [P1][Gate B] Settings auto-repair switch to local

Steps:
1. Make local unavailable due to missing/unspecified active model.
2. Keep at least one usable local model installed.
3. In Settings, use `Fix and Switch to Local`.

Expected result:
- Local fallback gets selected automatically.
- Provider switch completes without manual model re-selection.

Fail if:
- Switch remains blocked despite valid fallback candidate.
- UI says switched but thread still behaves as unavailable.

## 6) Cloud Provider Runtime and Availability

### CP-01 [P0][Gate A] Cloud provider healthy path

Steps:
1. Start healthy proxy.
2. Switch to cloud in Settings.
3. Send a message in a thread.

Expected result:
- Cloud provider switches cleanly.
- Thread reply succeeds.

Fail if:
- Switch appears successful but thread path still fails immediately.

### CP-02 [P0][Gate A] Cloud unavailable truthfulness

Steps:
1. With cloud selected, stop proxy or set unreachable proxy URL.
2. Refresh Settings and attempt thread send.

Expected result:
- Settings shows unavailable reason with actionable guidance.
- Thread shows provider banner with `Retry AI` and `Open Settings`.

Fail if:
- Unavailable state is hidden, generic, or non-actionable.
- Thread gets stuck instead of surfacing recovery path.

### CP-03 [P1][Gate B] Cloud diagnostics/privacy safety

Steps:
1. Force cloud error path.
2. Inspect user-visible error text and status details.

Expected result:
- Detail code / trace ID appear where expected.
- No API keys, prompts, or sensitive raw content leak in user-facing text.

Fail if:
- Sensitive data appears.
- Diagnostics are unusable for support triage.

## 7) Thread Runtime: Send/Retry/Speech/History

### TH-01 [P0][Gate A] Normal send path

Steps:
1. Open an existing thread.
2. Send a normal message.

Expected result:
- User message persists.
- Assistant reply appears and remains visible.
- Composer and loading state reset correctly.

Fail if:
- Message/reply disappears.
- UI remains stuck in sending/retrying.

### TH-02 [P0][Gate A] Provider failure + retry AI flow

Steps:
1. Force provider unavailable state in thread.
2. Use banner `Retry AI`.
3. If still unavailable, use `Open Settings`.

Expected result:
- Retry button/state is clear.
- Banner copy remains actionable.
- Open Settings path is functional.

Fail if:
- Retry silently does nothing.
- User is blocked with no clear next action.

### TH-03 [P0][Gate A] Speech input happy path and failure path

Steps:
1. Start/stop mic recording.
2. Verify transcript capture path.
3. Deny mic permission or force speech error and retry.

Expected result:
- Mic status text updates coherently.
- Permission/error messaging is actionable.
- Composer state remains usable after failures.

Fail if:
- Mic state gets stuck recording/not-recording incorrectly.
- Permission failure leaves unusable composer state.

### TH-04 [P0][Gate A] Load older messages

Steps:
1. Open a long thread.
2. Trigger `Load earlier messages` repeatedly.
3. Force one older-history failure if possible and retry.

Expected result:
- Pagination works deterministically.
- History error state shows explicit retry action.

Fail if:
- Silent truncation, duplicate loops, or no recovery action.

### TH-05 [P1][Gate B] Rename/delete thread flows

Steps:
1. Rename thread from options.
2. Delete a thread from options.

Expected result:
- Rename persists with clear saving state.
- Delete requires confirmation and navigates safely after success.

Fail if:
- Rename/delete causes stale title state or dead-end navigation.

### TH-06 [P1][Gate B] Post-processing resilience

Steps:
1. Exercise scenario likely to trigger extraction/action updates.
2. Observe thread reply persistence and app continuity.

Expected result:
- Assistant reply remains visible even if post-processing partially fails.
- App remains usable and state recovers.

Fail if:
- Reply disappears or thread becomes unusable due to post-processing issue.

## 8) Search To Thread Jump/Highlight

### SJ-01 [P0][Gate A] Message hit opens correct thread context

Steps:
1. Run a query with message hits.
2. Tap a message hit.

Expected result:
- App opens correct thread.
- Jump/highlight feedback appears on the matched message.

Fail if:
- Wrong thread/message context opens.
- No clear jump/highlight cue.

### SJ-02 [P1][Gate B] Jump hint recovery paths

Steps:
1. Open message hit requiring older history.
2. Use jump hint action (`Load earlier`).

Expected result:
- Hint is clear (`matched` / `earlier history` / `message unavailable`).
- Recovery action works when possible.

Fail if:
- Hint text is misleading or action cannot recover available context.

## 9) Brain / Feed / Search Knowledge Surfaces

### KB-01 [P0][Gate A] Brain load/empty/error states

Steps:
1. Open Brain with data.
2. Validate empty-state behavior in low-data environment.
3. Force refresh failure and retry.

Expected result:
- Sections remain legible.
- Empty/loading/error states are clear and recoverable.

Fail if:
- State is ambiguous or no retry path exists.

### KB-02 [P0][Gate A] Feed load/empty/error states

Steps:
1. Open Feed with activity.
2. Validate empty-state path.
3. Force refresh failure and retry.

Expected result:
- Timeline remains readable.
- Error states provide actionable retry.

Fail if:
- Feed action rows become non-interactive without explanation.

### KB-03 [P0][Gate A] Search query/retry/clear/no-results and stale suppression

Steps:
1. Run normal query.
2. Run no-results query.
3. Trigger retry path from error.
4. Clear query while previous search is in-flight.
5. Enter quick successive queries.

Expected result:
- Debounce behavior is stable.
- Stale results do not reappear after clear/reset.
- Error/empty states are explicit.

Fail if:
- Old results leak under new query.
- Retry creates duplicate/flickering stale state.

## 10) Reminder/Action Management

### AC-01 [P0][Gate A] Reminder done/canceled flows

Steps:
1. From Feed, mark reminder `Done`.
2. From Feed, mark another reminder `Cancel`.
3. Check Brain and Feed for state consistency.

Expected result:
- Reminder states update immediately and persist.
- Open-reminder counts/cards reconcile across Feed/Brain.

Fail if:
- Done/canceled action remains open or reappears incorrectly.

## 11) Dark Mode / Accessibility / Reduced Motion

### AX-01 [P1][Gate B] Dark mode spot check

Steps:
1. Switch device/theme to dark mode.
2. Review Thread, Settings, Search, Brain, Feed, Spaces.

Expected result:
- Contrast remains readable.
- Status chips/banners remain understandable.

Fail if:
- Critical text or status meaning is lost in dark mode.

### AX-02 [P1][Gate B] Reduced Motion spot check

Steps:
1. Enable device Reduce Motion.
2. Repeat key actions (send, retry, search jump, reminders).

Expected result:
- Motion is reduced.
- Meaning is preserved without animation.

Fail if:
- State changes rely on motion to be understandable.

### AX-03 [P1][Gate B] VoiceOver and tap-target spot check

Steps:
1. Enable VoiceOver.
2. Check icon-only controls (refresh/edit/options/send/mic).
3. Check banners/status chips and major action buttons.

Expected result:
- Labels/hints are meaningful.
- Tap targets are comfortable and reliable.

Fail if:
- Critical controls are unlabeled or hard to activate.

## 12) Nice-to-Have Stress Checks

### NS-01 [P2] Rapid navigation and tab-switch stress

Steps:
1. Rapidly switch tabs while refresh operations are in-flight.
2. Navigate Spaces -> Thread -> Search -> Thread repeatedly.

Expected result:
- No crashes, dead-end navigation, or stale blocking overlays.

Fail if:
- App freezes/crashes or shows impossible mixed states.

### NS-02 [P2] Long-history and long-session soak

Steps:
1. Run long thread session with repeated sends/history loads over 10-15 minutes.
2. Include provider retries and at least one search jump.

Expected result:
- Thread remains responsive and deterministic.

Fail if:
- Performance degrades into unusable state or history/jump logic becomes inconsistent.

## 13) Test Log Template (copy for each run)

- Tester:
- Date:
- App commit/branch:
- Device/runtime matrix:
- Proxy configuration used:
- Gate targeted (`A` or `B`):
- Scenario results (`Pass/Fail/Blocked/Not Run`):
- Blockers and repro notes:
- Open risks after run:
- Recommended next actions:

