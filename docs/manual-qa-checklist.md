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
2. Install model in onboarding:
   - model downloads, activates, and app opens to Spaces.
3. Settings:
   - install does not auto-switch active model.
   - explicit "Use This Model" changes active model.
4. Delete active model:
   - fallback model becomes active if present, else active model is cleared.

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
5. Confirm no crashes when navigating between tabs quickly.

## Thread UX

1. Speech language defaults match device locale (Android + iOS).
2. Rename thread works on both iOS and Android (modal path).
3. Long threads:
   - "Load Older Messages" appears.
   - full history can be loaded without silent truncation.
4. Provider/model unavailable:
   - banner copy is actionable.
   - sending is blocked when provider is clearly unavailable.
   - retry path is visible from the banner.
   - send alert includes an “Open Settings” action.

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
4. For Brain/Feed/Spaces/Space detail partial refresh failures, verify inline warning rows include an explicit “Retry” action.
5. In thread view, verify conversation history load failures still show a visible retry row even when no messages have loaded yet.
