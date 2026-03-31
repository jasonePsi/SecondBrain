# SecondBrain OpenAI Proxy

This service keeps OpenAI API keys off the mobile client.

## Endpoints

- `GET /health` -> provider/config status
- `POST /v1/chat` -> assistant chat generation
- `POST /v1/extract` -> structured memory-op extraction

All endpoints include `x-request-id` response headers, and JSON bodies include `requestId` where applicable for request tracing.
For `POST /v1/chat` and `POST /v1/extract`, request IDs are accepted from either `x-request-id` or body `requestId`.
If both are provided and differ, the header value is treated as canonical and the mismatch is logged.

## Run locally

```bash
cd backend-proxy
cp .env.example .env
npm ci
npm start
```

The mobile app should point to this proxy via:

- `EXPO_PUBLIC_AI_PROXY_BASE_URL=http://<your-host>:8787`

## Validate locally

```bash
cd backend-proxy
npm ci
npm run verify
```

From the repository root, you can run a full validation pass (app + proxy) with:

```bash
npm run verify:all
```

`verify:all` is self-contained after root `npm ci`; it installs `backend-proxy` dependencies automatically.

`npm run verify` runs:

- syntax check (`node --check src/server.js`)
- lightweight smoke tests (`tests/proxy.smoke.test.mjs`)

Dependency/security checks:

```bash
npm audit
npm audit --omit=dev
```

The proxy uses a targeted override for `path-to-regexp` to keep Express 4.x compatible while removing a known transitive advisory.

## Required environment variables

- `OPENAI_API_KEY` (required for cloud calls)
- `OPENAI_ASSISTANT_MODEL` (default: `gpt-5.4`)
- `OPENAI_AUX_MODEL` (default: `gpt-5.4-mini`)
- `OPENAI_PROXY_HOST` (default: `0.0.0.0`)
- `OPENAI_PROXY_PORT` (default: `8787`)
- `OPENAI_PROXY_REQUEST_TIMEOUT_MS` (default: `25000`)
- `OPENAI_PROXY_DEFAULT_PRIVACY_MODE` (default: `minimal`; allowed: `minimal`, `standard`, `debug`)
- `OPENAI_PROXY_DEFAULT_STORE` (default: `false`)
- `OPENAI_PROXY_DEBUG_LOGS` (optional, default: `false`; set to `true` to emit request/success diagnostics)

## Startup validation

The proxy validates configuration at startup and fails fast for invalid values (for example invalid port or timeout range). Missing `OPENAI_API_KEY` is reported as a startup warning and `/health` exposes `configured: false` until the key is set.

By default, the proxy logs warnings/errors and startup info, while high-volume request/success diagnostics stay off.
Transient upstream retry attempts are logged at debug level only, so normal validation output stays focused on actionable failures.
Set `OPENAI_PROXY_DEBUG_LOGS=true` for development tracing.

## Error Response Shape

For non-2xx responses, proxy endpoints return:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human-readable message"
  },
  "requestId": "trace-id"
}
```

This keeps mobile-side handling and debugging stable.

For `INVALID_REQUEST`, the message includes a short validation hint (for example which field is missing) without echoing request content.

`GET /health` returns a stable status shape:

```json
{
  "ok": true,
  "configured": true,
  "code": "OK",
  "requestId": "trace-id",
  "privacyDefaults": {
    "mode": "minimal",
    "store": false
  }
}
```

When not configured:

```json
{
  "ok": false,
  "configured": false,
  "code": "PROXY_NOT_CONFIGURED",
  "reason": "OPENAI_API_KEY is not configured",
  "requestId": "trace-id",
  "privacyDefaults": {
    "mode": "minimal",
    "store": false
  }
}
```

Malformed JSON payloads are normalized as:

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "Malformed JSON body"
  },
  "requestId": "trace-id"
}
```

## Retry behavior

- Mobile provider retries proxy chat requests conservatively (`1` retry) for transient transport failures.
- Mobile provider does not retry known non-retryable proxy error codes (`PROXY_NOT_CONFIGURED`, `INVALID_REQUEST`, `INVALID_JSON`).
- Mobile provider does not retry extraction requests.
- Proxy does not retry upstream OpenAI calls by default, to avoid duplicate user-visible operations.
