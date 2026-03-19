# SecondBrain OpenAI Proxy

This service keeps OpenAI API keys off the mobile client.

## Endpoints

- `GET /health` -> provider/config status
- `POST /v1/chat` -> assistant chat generation
- `POST /v1/extract` -> structured memory-op extraction

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

`npm run verify` runs:

- syntax check (`node --check src/server.js`)
- lightweight smoke tests (`tests/proxy.smoke.test.mjs`)

## Required environment variables

- `OPENAI_API_KEY` (required for cloud calls)
- `OPENAI_ASSISTANT_MODEL` (default: `gpt-5.4`)
- `OPENAI_AUX_MODEL` (default: `gpt-5.4-mini`)
- `OPENAI_PROXY_HOST` (default: `0.0.0.0`)
- `OPENAI_PROXY_PORT` (default: `8787`)
- `OPENAI_PROXY_REQUEST_TIMEOUT_MS` (default: `25000`)
- `OPENAI_PROXY_DEFAULT_PRIVACY_MODE` (default: `minimal`)
- `OPENAI_PROXY_DEFAULT_STORE` (default: `false`)

## Startup validation

The proxy validates configuration at startup and fails fast for invalid values (for example invalid port or timeout range). Missing `OPENAI_API_KEY` is reported as a startup warning and `/health` exposes `configured: false` until the key is set.

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
