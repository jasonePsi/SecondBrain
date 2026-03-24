# SecondBrain Architecture Overview

## Data Flow

1. UI screens call repository and service modules under `src/`.
2. Repositories (`src/repositories/*`) are the only layer that reads/writes SQLite tables.
3. `src/db/migrations.ts` defines additive schema evolution and index creation.
4. Screen state is refreshed from repos/services after mutating operations (create, rename, delete, status changes).

## App Bootstrap Flow

Startup entrypoint is `app/index.tsx`.

Initialization order:

1. Run `runMigrations()` from `src/db/migrations.ts`.
2. Read active AI provider from `LLMService`.
3. If cloud is active:
   - route to app if proxy is available
   - route to settings if proxy is unavailable
4. If local provider path is active:
   - route to app when local provider status is available
   - route to onboarding when no models are installed
   - route to settings when models exist but local is unavailable/misconfigured

Routing decisions are kept deterministic in `src/services/provider_bootstrap_utils.ts`.

SQLite client setup happens in `src/db/client.ts`.

Core tables:

- `spaces`, `threads`, `messages`
- `entities`, `facts`, `actions`
- `feed_items`
- `model_settings`, `app_settings`

## Memory Flow (Assistant Turns)

1. `app/thread/[id].tsx` sends user text and persists the user message.
2. `MemoryService.buildTurnContext()` builds compact context from:
   - thread summary
   - recent messages
   - retrieved older hits (`RetrievalService`)
   - relevant facts/actions across thread/space/global scopes
3. `LLMService.chat()` generates the assistant reply through the active provider.
4. Assistant reply is persisted to `messages`.
5. `TurnPostProcessingService.processTurn()` runs:
   - structured extraction (`StructuredExtractionService`)
   - operation execution (`OpsExecutor`)
   - summary update (`MemoryService.updateThreadSummaryIfNeeded`)
   - deterministic stage orchestration via `runTurnPostProcessingPipeline()` in `src/services/turn_post_processing_utils.ts`
   - each stage degrades gracefully (extraction/ops/summary failures do not break reply persistence)

## Provider Architecture

`LLMService` is a provider router with a minimal interface:

- `init()`
- `chat(messages, options)`
- `process(prompt, options)` for structured extraction/summaries
- `release()`
- `getStatus()`

Implementations:

- `LocalLlamaProvider` (`src/services/providers/LocalLlamaProvider.ts`)
- `OpenAIProxyProvider` (`src/services/providers/OpenAIProxyProvider.ts`)

`backend-proxy` validates config at startup (host/port/timeout/model IDs), emits non-secret startup warnings, and returns stable error shapes with `error.code`, `error.message`, and `requestId`.

Cloud health checks are traceable end-to-end via request IDs (`x-request-id` / `requestId`) and expose explicit status fields (`ok`, `configured`, `code`, `reason`).
For chat/extraction endpoints, request IDs can be supplied in either header or body; header IDs remain canonical when both are present.
Settings surfaces provider detail codes and request traces when cloud availability checks fail.
`LLMService` normalizes provider status-check failures into deterministic unavailable states (`CLOUD_PROVIDER_STATUS_CHECK_FAILED` / `LOCAL_PROVIDER_STATUS_CHECK_FAILED`) so startup/settings handling stays coherent even when checks throw.
Runtime provider release is deferred while requests are in flight; provider switches are explicit and apply to subsequent turns.

Cloud provider error handling normalizes proxy failures into stable, user-safe messages.

Retry policy is conservative:
- mobile provider retries chat transport failures once
- mobile provider does not retry known non-retryable proxy failures (for example config/request errors)
- mobile provider does not retry extraction calls
- proxy does not retry upstream OpenAI calls by default

Provider selection is persisted in `app_settings` (`active_ai_provider`) and managed from Settings.

## Model Lifecycle

Local model lifecycle is handled by `ModelManager` + `ModelRepo`:

1. Install/download model file.
2. Persist install metadata in `model_settings`.
3. Activate explicitly (`ModelRepo.activateModel`).
4. Runtime provider init loads active model from disk.
5. Deleting an active model selects a fallback installed model or clears active state.
   - fallback selection ignores invalid/stale entries to keep active-model state deterministic.

Settings keeps install and activate actions separate.

## Structured Extraction Location

Structured extraction lives in:

- `src/services/StructuredExtractionService.ts` (prompt + JSON validation)
- `src/services/OpsExecutor.ts` (safe execution of allowed ops)
- `src/services/TurnPostProcessingService.ts` (chat-loop integration)

Supported op families:

- `UPSERT_FACT`
- `CREATE_ACTION` (reminders)
- `UPDATE_THREAD`

## Validation Story

App-side:

- `npm run typecheck`
- `npm test`
- `npm run verify`
- `npm run verify:all` (release gate: app checks + proxy verify)

Proxy-side:

- `npm --prefix backend-proxy run verify` (syntax + smoke tests)
- smoke tests cover health/config parity, invalid payload/JSON shaping, request-id propagation, and privacy defaults/overrides across chat + extract

## Feed and Brain Product Surfaces

- `BrainService` composes structured memory cards (entities/facts/open actions) with scope labeling.
- `FeedService` hydrates `feed_items` into human-readable, navigable cards and exposes reminder management affordances.
