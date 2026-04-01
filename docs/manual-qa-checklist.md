# Manual QA Checklist (Final Hardening)

## Setup

1. Launch app from a clean install.
2. Ensure migrations run successfully (no redbox).
3. Validate both provider modes in Settings (`local`, `cloud` if proxy configured).

## Onboarding and Model Lifecycle

1. No installed models:
   - app routes to onboarding model selection.
   - a local model is pre-selected automatically for first-run flow.
   - download flow labels are accurate.
   - stale/missing local model files are not shown as installed.
2. Install model in onboarding:
   - model downloads, activates, and app opens to Spaces.
   - download screen shows clear stage/progress with understandable retry/back actions.
3. Settings:
   - grouped sections remain legible: active provider, cloud status, local models, fallback, privacy/diagnostics, troubleshooting.
   - install does not auto-switch active model.
   - explicit "Use This Model" changes active model (or "Set as Fallback" when cloud is active).
   - switching provider is blocked when the target provider is unavailable, with an actionable reason.
   - when local is unavailable due to missing/unspecified active model but another usable local model exists, Settings shows **Fix and Switch to Local** and succeeds without forcing manual re-selection first.
   - rapid provider/model actions (switch + retry + refresh) do not revert to stale status cards/badges.
4. Delete active model:
   - fallback model becomes active if present, else active model is cleared.
   - when cloud is active, deleting local active/fallback model keeps cloud active and updates fallback messaging clearly.
5. Missing-file reconciliation:
   - simulate a missing local model file (or stale metadata).
   - Settings marks the model as `Missing File` (not `Installed`).
   - if local provider is active and another usable model exists, startup switches to fallback automatically.
   - if local provider is active, no active model is selected, and usable local models exist, startup activates a fallback model automatically.
   - if no usable local files remain, startup routes to onboarding.

## Provider Availability (Cloud Unavailable Scenario)

1. Set cloud provider in Settings.
2. Stop backend-proxy (or point app to an unreachable proxy URL).
3. Confirm:
   - Settings shows cloud as unavailable with actionable reason.
   - unavailable reason includes a stable detail code and trace ID when available.
   - user-facing error text does not expose secrets (no API key values).
   - app startup routes to Settings when cloud is selected but unavailable.
   - thread send shows a clear provider/model availability message and does not crash.
   - thread error banner supports `Retry AI` and `Open Settings`.

## Core Navigation

1. Create a space and thread.
2. Create a space from Feed or Spaces and confirm the app opens that new space detail screen.
3. Rename and delete threads/spaces from edit actions.
4. Empty states:
   - Spaces tab shows a clear CTA to create a space.
   - Space detail shows a clear CTA to create a thread.
5. Error-state navigation:
   - Spaces load failure view includes both `Retry` and `Create Space`.
   - Space detail load failure view includes both `Retry` and `Go to Spaces`.
6. Confirm no crashes when navigating between tabs quickly.

## Thread UX

1. Speech language defaults match device locale (Android + iOS).
2. Rename thread works on both iOS and Android (modal path).
3. Long threads:
   - "Load Older Messages" appears.
   - full history can be loaded without silent truncation.
   - while older messages load, status text is visible (not spinner-only).
   - if older-history fetch fails, retry action is visible and works.
   - rename thread shows a clear saving state and does not double-submit.
4. Provider/model unavailable:
   - banner copy is actionable.
   - sending is blocked when provider is clearly unavailable.
   - retry path is visible from the banner.
   - send alert includes an "Open Settings" action.
   - while retrying AI, composer/mic actions stay disabled and show reconnecting state.
5. Open a thread from a message search hit:
   - thread shows a clear jump status ("jumped", "load earlier", or "message unavailable").
   - when needed, "Load earlier" from jump status helps locate the message context.

## Memory + Feed

1. Send messages that include explicit facts and reminders.
2. Confirm:
   - Brain tab shows entities/facts/open actions with scope labels.
   - Feed tab shows readable cards (not raw type/ref values).
   - reminder cards can be marked done/canceled and update immediately.
3. Tap-through:
   - feed/brain items navigate to related thread/space when route is available.

## End-to-End Memory Scenario

1. In a thread, send: "My dentist appointment is next Tuesday at 9am. Remind me the day before."
2. Confirm assistant reply is persisted even if post-processing later fails.
3. Confirm Brain shows fact(s) and open reminder in scoped sections.
4. Confirm Feed shows a human-readable reminder card.
5. Repeat once with cloud provider enabled (proxy healthy) and confirm fact/reminder extraction still updates Brain + Feed.

## Action Management

1. From Feed, mark a reminder as done.
2. From Feed, cancel a reminder.
3. Confirm feed updates and reminder no longer appears as open.
4. Validate scheduled notification is cleared for done/canceled reminders.

## Search

1. Type a query and verify debounce (no instant keystroke flooding).
2. If search errors, verify error row offers “Retry” and “Clear”.
3. Validate sectioned results (spaces/threads/messages).
4. Confirm message results show snippets and route to thread.
5. Open a message hit and confirm thread scrolls/highlights relevant message context.
6. Try a no-results query and verify friendly empty state with a “Clear search” action.
7. Confirm message hits show role/thread/time context.
8. Clear query while search is in-flight and confirm stale results do not reappear.
9. Start a second query quickly after a first one and confirm previous-query results do not remain visible under the new query header.
10. Re-run the same query using Retry and confirm results refresh once (no duplicate/flicker loop).
11. While typing a new query, old settled results and old error banners should not continue showing under the new text.

## States and Polish

1. Validate loading/empty/error states on:
   - Spaces tab
   - Space detail
   - Feed tab
   - Brain tab
   - Search tab
2. Confirm no visible placeholder build labels remain.
3. Confirm onboarding model screens:
   - loading/error states are understandable.
   - model status and battery impact copy are clear.
   - selected model CTA matches the actual next step ("Use Selected Model" vs "Download & Continue").
4. For Brain/Feed/Spaces/Space detail partial refresh failures, verify inline warning rows include an explicit “Retry” action.
5. In thread view, verify conversation history load failures still show a visible retry row even when no messages have loaded yet.
6. Feed empty state offers a direct path to Spaces ("Go to Spaces").
7. In Spaces edit mode, rename/delete controls should show in-flight state (saving/spinner) and avoid duplicate actions.
8. Motion and haptics:
   - with default settings, button presses and list updates feel subtle (no flashy transitions).
   - thread jump-from-search shows a short, clear highlight cue.
   - haptic feedback appears on send success, reminder completion/cancel, and provider retry outcomes.
9. Reduced Motion:
   - enable device Reduce Motion and confirm transitions become minimal.
   - core states remain understandable without animation.
10. Accessibility:
   - icon-only buttons have meaningful VoiceOver labels/hints.
   - primary controls keep comfortable tap targets.
   - warning/error copy is understandable without relying on color alone.
