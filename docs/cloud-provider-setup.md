# Cloud Provider Setup (OpenAI via Proxy)

This phase adds a provider abstraction so the app can run with:

- Local on-device provider (`llama.rn`, offline)
- Cloud provider (OpenAI through your backend proxy)

The mobile app never stores a real OpenAI API key.

## 1) Start the backend proxy

```bash
cd backend-proxy
cp .env.example .env
npm install
npm start
```

Required backend env vars:

- `OPENAI_API_KEY`: server-side OpenAI key (never shipped to mobile)
- `OPENAI_ASSISTANT_MODEL` (default: `gpt-5.4`)
- `OPENAI_AUX_MODEL` (default: `gpt-5.4-mini`)
- `OPENAI_PROXY_PORT` (default: `8787`)
- `OPENAI_PROXY_HOST` (default: `0.0.0.0`)
- `OPENAI_PROXY_REQUEST_TIMEOUT_MS` (default: `25000`)
- `OPENAI_PROXY_DEFAULT_PRIVACY_MODE` (default: `minimal`)
- `OPENAI_PROXY_DEFAULT_STORE` (default: `false`)

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

If the backend is unavailable or not configured, cloud selection is disabled with a reason.

## Privacy defaults

The proxy request contract includes:

- `privacy.mode` (default `minimal`)
- `privacy.store` (default `false`)

By default, outbound calls are made in privacy-conscious mode (`store=false`) and requests are tracked via request IDs (`x-request-id`) for debugging without exposing secrets.

## Request contract (mobile -> proxy)

- `POST /v1/chat`
  - `{ messages, task, requestId?, privacy? }`
- `POST /v1/extract`
  - `{ prompt, task, requestId?, privacy? }`

Supported `task` values:

- `assistant`
- `summary`
- `extraction`
- `title`
- `ranking`

Model routing defaults:

- `assistant` -> `gpt-5.4`
- other tasks (`summary`, `extraction`, `title`, `ranking`) -> `gpt-5.4-mini`
