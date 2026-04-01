# SecondBrain iOS Redesign Plan

## Scope and Guardrails

This plan defines the product/design direction before broad UI restyling.

- Preserve all current behavior across local + cloud provider paths.
- Keep data, provider, memory, and extraction architecture intact.
- Favor native iOS patterns over custom visual novelty.
- Avoid broad rewrites until shared primitives are in place.

## 1) Current Product + UI Architecture Audit

### Functional inventory that must be preserved

- App bootstrap + provider-aware startup routing (`/app/index.tsx`)
- Tabs and top-level surfaces (`/app/(tabs)/_layout.tsx`)
- Spaces list + create + edit/reorder/rename/delete (`/app/(tabs)/spaces.tsx`, `/app/space/new.tsx`)
- Space detail thread management (`/app/space/[id].tsx`)
- Thread runtime flows (`/app/thread/[id].tsx`):
  - send lifecycle and turn-stage UX
  - provider retry / availability messaging
  - speech input + language toggle
  - older-history loading
  - search jump/highlight hints
  - thread rename/delete
- Search across spaces/threads/messages with debounce and deep-link message jump (`/app/(tabs)/search.tsx`)
- Brain structured memory snapshot (`/app/(tabs)/brain.tsx`, `/src/services/BrainService.ts`)
- Feed human-readable activity + action updates (`/app/(tabs)/feed.tsx`, `/src/services/FeedService.ts`)
- Settings provider/model lifecycle (`/app/(tabs)/settings.tsx`, `/src/services/settings_lifecycle_utils.ts`, `/src/services/provider_status_copy_utils.ts`)
- Onboarding model selection + download/install/activate (`/app/onboarding/model-selection.tsx`, `/app/onboarding/download.tsx`)

### Concrete design debt in current repo

1. Hardcoded visual tokens and duplicated style decisions
- Color literals are repeated across screens (`#FEF2F2`, `#DBEAFE`, `#DCFCE7`, etc.) instead of semantic roles.
- Typography is mostly manual `fontSize/fontWeight`; semantic text hierarchy is inconsistent.
- Repeated “pill”, “card”, “warning row”, and “retry button” patterns are not centralized.

2. List architecture is inconsistent and card-heavy
- Feed, Brain, Search, and parts of Spaces/Space detail use different row/card metaphors and spacing rhythms.
- Several screens mix full-screen states, inline warning rows, and ad-hoc headers without a common scaffold.

3. Oversized screen modules with mixed orchestration + rendering
- `app/thread/[id].tsx` and `app/(tabs)/settings.tsx` still carry dense UI state + lifecycle orchestration.
- Both screens are functional but expensive to reason about and risky for visual iterations.

4. Top-level IA feels equal-weight even when user intent is not equal
- Tabs currently treat Feed/Search/Spaces/Brain/Settings with similar visual weight.
- Real primary loop is Spaces -> Thread; Search/Feed/Brain are retrieval/support surfaces.

5. Native iOS affordances are underused
- Limited use of large-title patterns, grouped/inset lists, and consistent destructive/secondary actions.
- Current FAB pattern (`CaptureFAB`) is functional but less iOS-native than list-section action placement for many surfaces.

## 2) Product North Star

SecondBrain should feel like a calm memory workspace, not a chat demo.

Target feel:
- Immediate orientation: where you are, what changed, what to do next.
- Quiet confidence: minimal visual noise, clear state messaging, deliberate hierarchy.
- Memory-first utility: spaces and threads remain the working surface, while Brain/Feed/Search become reliable memory access layers.

Information density model:
- Show only the most decision-relevant information first (status, next action, latest context).
- Keep secondary diagnostics discoverable but visually quiet.
- Prefer sectioned, grouped lists over floating card stacks.

Calm + power balance:
- Calm by default: restrained color, semantic typography, predictable spacing.
- Powerful when needed: fast access to retry, provider fixes, model lifecycle actions, and context jumps.

## 3) Information Architecture Recommendation

### Recommendation

Keep current five-tab structure for now, but rebalance prominence and hierarchy in implementation:

1. `Spaces` (primary work surface)
2. `Feed` (recent changes)
3. `Brain` (structured memory)
4. `Search` (global retrieval)
5. `Settings` (system/config)

### Why keep Search as its own tab

- Search is already cross-scope (spaces, threads, messages) and supports deep jump flow.
- Converting search to only an inline affordance now risks discoverability and regression.
- Keeping a dedicated Search tab preserves power-user retrieval speed while we improve in-screen search entry points later.

### Transition notes

- No immediate route/schema changes.
- In later UI phases, add inline search entry points (Spaces/Thread headers) that deep-link into Search tab with prefilled query.

## 4) Screen Hierarchy + Interaction Model

### Spaces (`/app/(tabs)/spaces.tsx`)
- Primary goal: choose or create a workspace.
- Secondary goal: reorder/rename/delete spaces.
- Primary action: create space.
- Immediately visible: space list, create affordance, lightweight refresh/error state.
- Move to secondary controls: reorder/rename/delete in explicit edit mode/sheet.

### Space Detail (`/app/space/[id].tsx`)
- Primary goal: choose or create a thread in this space.
- Secondary goal: thread maintenance (rename/delete).
- Primary action: create thread.
- Immediately visible: thread list + last activity time.
- Move to secondary controls: destructive actions in contextual menu/confirmation.

### Thread (`/app/thread/[id].tsx`)
- Primary goal: reliable send/receive conversation with clear status.
- Secondary goal: history navigation, provider retry, speech input, rename/delete.
- Primary action: send message.
- Immediately visible: conversation, send controls, only critical warning banners.
- Move to secondary controls: rename/delete and diagnostics in compact menu/sheet.

### Search (`/app/(tabs)/search.tsx`)
- Primary goal: retrieve relevant spaces/threads/messages quickly.
- Secondary goal: route directly to relevant context.
- Primary action: query entry.
- Immediately visible: search field + concise sectioned results.
- Move to secondary controls: low-priority metadata and status details.

### Feed (`/app/(tabs)/feed.tsx`)
- Primary goal: understand recent changes/actions across brain.
- Secondary goal: act on reminders and open context.
- Primary action: open activity context or resolve reminder.
- Immediately visible: recent human-readable events with clear timestamp + status.
- Move to secondary controls: diagnostic or low-signal metadata.

### Brain (`/app/(tabs)/brain.tsx`)
- Primary goal: scan structured memory by type/scope.
- Secondary goal: jump to source context.
- Primary action: open relevant source thread/space.
- Immediately visible: grouped sections (Entities/Facts/Open Actions), last refresh.
- Move to secondary controls: verbose field detail behind row expansion/sheet if needed.

### Settings (`/app/(tabs)/settings.tsx`)
- Primary goal: keep provider and model lifecycle healthy.
- Secondary goal: storage and fallback visibility.
- Primary action: switch provider, install/activate/delete model.
- Immediately visible: active provider, availability reason, active/fallback model.
- Move to secondary controls: nuanced diagnostics in expandable details rows.

### Onboarding Model Selection (`/app/onboarding/model-selection.tsx`)
- Primary goal: pick a usable local model confidently.
- Secondary goal: understand storage/battery tradeoffs.
- Primary action: continue with selected model.
- Immediately visible: recommended option, storage fit, installed/active state.
- Move to secondary controls: deep model stats in compact disclosures.

### Onboarding Download (`/app/onboarding/download.tsx`)
- Primary goal: communicate trustworthy installation progress.
- Secondary goal: recover gracefully from install failure.
- Primary action: retry failed install.
- Immediately visible: progress, expected duration guidance, completion status.
- Move to secondary controls: back-to-selection fallback action.

## 5) Design System Direction (iOS-First)

### Color roles (semantic)
- `bg/base`, `bg/grouped`, `bg/elevated`
- `text/primary`, `text/secondary`, `text/tertiary`
- `accent/primary`
- `status/success`, `status/warning`, `status/error`, `status/info`
- `separator/default`, `separator/strong`

### Typography hierarchy (semantic text styles)
- Large title, title 1/2/3
- headline/body/callout/subheadline/footnote/caption
- no arbitrary one-off font sizing unless functionally necessary

### Spacing rhythm
- 4pt base rhythm with preferred layout steps: 8 / 12 / 16 / 20 / 24.
- consistent top/bottom section spacing; avoid per-screen drift.

### Radius rules
- small controls: 8
- grouped surfaces: 12
- full-width modals/sheets: platform-default first
- avoid large novelty radii

### Strokes/separators
- use separators for grouped lists and row boundaries.
- avoid heavy borders around every element.

### Background + grouped surfaces
- prefer grouped/inset grouped section containers.
- reserve high-contrast cards for warnings/progress states.

### Status colors
- success: reminders done/healthy state
- warning: fallback/risk state
- error: blocked/unavailable state
- info: neutral progress/checking state

### Iconography
- SF Symbols semantics (via closest Ionicons mapping for Expo), consistent weight/size by role.
- avoid mixed icon metaphors for same action class.

### Motion
- subtle state transitions (loading to content, banner appearance, section expand/collapse).
- avoid decorative motion loops.
- respect reduced-motion settings where available.

### Haptics
- light haptic on primary confirmation actions (send success, model activate, reminder status update).
- warning/destructive haptic on delete/failure confirmations.

### Sheets/modals
- destructive flows via confirmation alert or sheet + confirm.
- edit flows (rename/create quick forms) in compact sheets with clear primary action.

### Empty/loading/error state rules
- each screen must provide:
  - clear empty-state explanation
  - explicit recovery action for recoverable errors
  - loading text that describes what is loading

### Explicit "do not do" list
- No glass-heavy or blur-heavy UI across core list surfaces.
- No gradient-heavy card stacks.
- No hidden critical actions behind long-press-only gestures.
- No mixed status language (internal/debug wording in user-facing copy).
- No large per-screen style forks that bypass shared tokens/components.

## 6) Reusable Component Inventory (before broad restyle)

Planned shared primitives (small + practical):

1. `ScreenScaffold` (safe area + grouped background + optional large title)
2. `ScreenHeader` (large-title/compact modes + optional trailing actions)
3. `SectionBlock` (title, optional subtitle, content slot)
4. `InsetGroupedList` (section containers + separators)
5. `ListRow` (title/subtitle/trailing/meta + press state)
6. `StatusPill` (semantic statuses)
7. `InlineBanner` (`info|warning|error`, optional action)
8. `PrimaryButton`, `SecondaryButton`, `DestructiveButton`
9. `SearchField` (debounced text input style + clear/retry affordances)
10. `SheetContainer` (shared spacing/header/action row)
11. `EmptyStateView`
12. `LoadingStateView`
13. `ErrorStateView`
14. `ComposerBar` (thread input/mic/send row with state slots)
15. `ProgressRow` (download/install/progress states)

## 7) Rollout Plan

### Phase A: Foundation tokens + scaffolds
- Introduce semantic color/typography/spacing tokens.
- Add scaffold + state primitives.
- Keep screen behavior unchanged.

### Phase B: Navigation + top-level list structure
- Apply scaffold and grouped list patterns to Spaces/Feed/Brain/Search.
- Normalize empty/loading/error treatment.

### Phase C: Thread runtime UX hardening polish
- Keep existing lifecycle logic; move presentation to shared primitives.
- Preserve send/retry/history/jump/speech behaviors.

### Phase D: Settings + onboarding clarity pass
- Normalize provider/model status language and action hierarchy.
- Keep lifecycle semantics from existing service utilities.

### Phase E: Final consistency + QA
- tighten copy, spacing, and interaction consistency
- run full manual checklist + non-regression pass

## 8) Non-Regression Checklist (must hold during redesign)

- Local provider path remains fully usable offline.
- Cloud provider path continues through proxy only.
- Provider availability/status reasons remain actionable.
- Onboarding install/download/activate remains intact.
- Settings install/activate/delete/fallback/missing-file flows remain intact.
- Spaces and threads create/rename/delete remain intact.
- Thread send, retry AI, provider banner, speech, and older history remain intact.
- Search debounce + deep message jump/highlight remains intact.
- Brain + Feed continue reflecting post-processing memory/action updates.
- Reminder done/canceled actions remain intact.
- `npm run verify:all` remains green at each phase boundary.

## Open Design Questions

1. Tab order finalization: keep current order or promote `Spaces` to first tab in implementation phase.
2. `CaptureFAB` future: retain global FAB in select screens vs migrate to native header/section actions for consistency.
3. Diagnostics verbosity policy: how much provider detail code/trace info should remain visible by default vs expanded state.
4. Thread header density: rename/delete + provider status surface should stay in alert menu or move to a compact sheet.

