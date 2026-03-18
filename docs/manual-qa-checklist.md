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
3. Tap-through:
   - feed/brain items navigate to related thread/space when route is available.

## Action Management

1. From Feed, mark a reminder as done.
2. From Feed, cancel a reminder.
3. Confirm feed updates and reminder no longer appears as open.
4. Validate scheduled notification is cleared for done/canceled reminders.

## Search

1. Type a query and verify debounce (no instant keystroke flooding).
2. Validate sectioned results (spaces/threads/messages).
3. Confirm message results show snippets and route to thread.
4. Try a no-results query and verify friendly empty state.

## States and Polish

1. Validate loading/empty/error states on:
   - Spaces tab
   - Space detail
   - Feed tab
   - Brain tab
   - Search tab
2. Confirm no visible placeholder build labels remain.
