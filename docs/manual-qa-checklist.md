# Manual QA Checklist (Final Hardening)

## Setup

1. Launch app from a clean install.
2. Ensure migrations run successfully (no redbox).
3. Validate both provider modes in Settings (`local`, `cloud` if proxy configured).

## Onboarding and Model Lifecycle

1. No installed models:
   - app routes to onboarding model selection.
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
   - app startup routes to Settings when cloud is selected but unavailable.
   - thread send shows a clear provider/model availability message and does not crash.

## Core Navigation

1. Create a space and thread.
2. Rename and delete threads/spaces from edit actions.
3. Confirm no crashes when navigating between tabs quickly.

## Thread UX

1. Speech language defaults match device locale (Android + iOS).
2. Rename thread works on both iOS and Android (modal path).
3. Long threads:
   - "Load Older Messages" appears.
   - full history can be loaded without silent truncation.

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

## Action Management

1. From Feed, mark a reminder as done.
2. From Feed, cancel a reminder.
3. Confirm feed updates and reminder no longer appears as open.
4. Validate scheduled notification is cleared for done/canceled reminders.

## Search

1. Type a query and verify debounce (no instant keystroke flooding).
2. Validate sectioned results (spaces/threads/messages).
3. Confirm message results show snippets and route to thread.
4. Open a message hit and confirm thread scrolls/highlights relevant message context.
5. Try a no-results query and verify friendly empty state.

## States and Polish

1. Validate loading/empty/error states on:
   - Spaces tab
   - Space detail
   - Feed tab
   - Brain tab
   - Search tab
2. Confirm no visible placeholder build labels remain.
