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
npm install
npm start
```

The mobile app should point to this proxy via:

- `EXPO_PUBLIC_AI_PROXY_BASE_URL=http://<your-host>:8787`
