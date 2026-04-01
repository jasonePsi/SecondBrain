# Cloud Provider Setup (OpenAI via Proxy)

This phase adds a provider abstraction so the app can run with:

- Local on-device provider (`llama.rn`, offline)
- Cloud provider (OpenAI through your backend proxy)

The mobile app never stores a real OpenAI API key.

## 1) Start the backend proxy

```bash
cd backend-proxy
cp .env.example .env
npm ci
npm start
```

Required backend env vars:

- `OPENAI_API_KEY`: server-side OpenAI key (never shipped to mobile)
- `OPENAI_ASSISTANT_MODEL` (default: `gpt-5.4`)
- `OPENAI_AUX_MODEL` (default: `gpt-5.4-mini`)
- `OPENAI_PROXY_PORT` (default: `8787`)
- `OPENAI_PROXY_HOST` (default: `0.0.0.0`)
- `OPENAI_PROXY_REQUEST_TIMEOUT_MS` (default: `25000`)
- `OPENAI_PROXY_DEFAULT_PRIVACY_MODE` (default: `minimal`; allowed: `minimal`, `standard`, `debug`)
- `OPENAI_PROXY_DEFAULT_STORE` (default: `false`)
- `OPENAI_PROXY_DEBUG_LOGS` (optional, default: `false`; enable only for verbose development tracing)

## 2) Point mobile app to proxy

Set this env var when running Expo:

- `EXPO_PUBLIC_AI_PROXY_BASE_URL=http://<your-host>:8787`

You can also set Expo `extra` config:

- `extra.aiProxyBaseUrl`
- `extra.aiDefaultProvider` (`local` or `cloud`)

## 3) Switch provider in-app

Open **Settings -> AI Provider** and select:

- `Local (On-device)` for offline mode
- `OpenAI (Cloud via Proxy)` when backend is available

Settings now separates provider lifecycle into dedicated sections (`Active Provider`, `Cloud Status`, `Local Models`, `Fallback`, `Privacy & Diagnostics`, `Troubleshooting`) so availability and next-step actions remain explicit.

If the backend is unavailable or not configured, cloud selection is disabled with a reason.
Cloud switch attempts re-check live health and show actionable detail codes/traces when unavailable.
If a provider switch happens while a turn is still in flight, the current reply finishes first and the switch applies to the next turn.
If local provider status is unavailable because no local model is selected or the active local file is missing, and another usable local model exists, Settings offers **Fix and Switch to Local** (auto-selects a deterministic fallback and retries local availability).
If local is unavailable for other reasons, switching to local remains blocked until setup is fixed in Settings.

If cloud is selected but unavailable during startup, the app routes to Settings and surfaces the provider reason there.
If local provider is selected and local status is unavailable because the active file is missing or no active local model is selected, startup attempts to activate a usable local fallback model before routing.
Provider health mapping is deterministic and includes stable detail codes (for example `CLOUD_PROXY_URL_MISSING`, `CLOUD_PROXY_HEALTH_HTTP_ERROR`, `CLOUD_PROXY_INVALID_HEALTH_RESPONSE`, `CLOUD_PROXY_UNREACHABLE`).
Local provider lifecycle/status also exposes explicit detail codes (`LOCAL_MODEL_NOT_SELECTED`, `LOCAL_MODEL_FILE_MISSING`, `LOCAL_MODEL_READY`) so startup/settings/thread errors stay actionable.

## Privacy defaults

The proxy request contract includes:

- `privacy.mode` (default `minimal`)
- `privacy.store` (default `false`)

By default, outbound calls are made in privacy-conscious mode (`store=false`) and requests are tracked via request IDs (`x-request-id`) for debugging without exposing secrets.
Cloud/proxy warnings and errors always include request IDs and safe metadata. High-volume request/success diagnostics are debug-gated (`OPENAI_PROXY_DEBUG_LOGS=true`). Raw note text and prompts are not logged.
Request IDs can be supplied in either `x-request-id` or body `requestId`; when both are present, the header value is canonical.
Mobile chat retries stay conservative and skip known non-retryable proxy failures (`PROXY_NOT_CONFIGURED`, `INVALID_REQUEST`, `INVALID_JSON`).

## Request contract (mobile -> proxy)

- `POST /v1/chat`
  - `{ messages, task, requestId?, privacy? }`
- `POST /v1/extract`
  - `{ prompt, task, requestId?, privacy? }`

`GET /health` returns `ok`, `configured`, `code`, `reason?`, `requestId`, and `privacyDefaults`.

Supported `task` values:

- `assistant`
- `summary`
- `extraction`
- `title`
- `ranking`

Model routing defaults:

- `assistant` -> `gpt-5.4`
- other tasks (`summary`, `extraction`, `title`, `ranking`) -> `gpt-5.4-mini`

## Proxy validation

Run lightweight proxy checks:

```bash
cd backend-proxy
npm run verify
```

This includes syntax + smoke coverage for:

- `GET /health`
- invalid payload handling
- malformed JSON handling (`INVALID_JSON`)
- stable error shape with `error.code`, `error.message`, and `requestId`
- validation hint messaging for `INVALID_REQUEST` without exposing payload content
- request ID propagation (`x-request-id` -> response `requestId`)
- request ID parity rules for both chat and extract (`x-request-id` header is canonical when body `requestId` differs)
- unconfigured/configured health response parity for `privacyDefaults`
- default privacy forwarding to upstream calls (chat + extract)
- per-request privacy override handling (chat + extract)

At startup, the proxy validates config values (port/timeout/models) and fails fast on invalid settings.
