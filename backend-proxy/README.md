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

## Required environment variables

- `OPENAI_API_KEY` (required for cloud calls)
- `OPENAI_ASSISTANT_MODEL` (default: `gpt-5.4`)
- `OPENAI_AUX_MODEL` (default: `gpt-5.4-mini`)
- `OPENAI_PROXY_HOST` (default: `0.0.0.0`)
- `OPENAI_PROXY_PORT` (default: `8787`)
- `OPENAI_PROXY_REQUEST_TIMEOUT_MS` (default: `25000`)
- `OPENAI_PROXY_DEFAULT_PRIVACY_MODE` (default: `minimal`)
- `OPENAI_PROXY_DEFAULT_STORE` (default: `false`)
