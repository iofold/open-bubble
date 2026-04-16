# apps/api

Local Fastify API MVP for Codex Bubble.

## Commands

Run everything from inside `apps/api/`, unless you want the repo-level launcher.

```bash
npm install
npm run dev
npm run dev:ngrok
npm test
npm run typecheck
npm run build
```

From the repository root, `./scripts/start-api-ngrok.sh` installs missing API dependencies, starts the API server, opens an `ngrok` tunnel, prints the public URL, and syncs `OPEN_BUBBLE_API_BASE_URL` into the repo-level `.env`.

## Local endpoints

- `GET /health`
- `POST /prompt`
- `GET /documentation`
- `GET /openapi.json`

## Prompt request contract

`POST /prompt` uses `multipart/form-data` with:

- `screenMedia`: required file, `image/*` or `video/*`
- `promptText`: optional text field
- `promptAudio`: optional file, `audio/*`

At least one of `promptText` or `promptAudio` must be present.

The frontend forwards `promptAudio` bytes as-is. It does not transcribe them client-side.
