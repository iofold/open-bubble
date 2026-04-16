# Open Bubble

Open Bubble is a docs-first hackathon repo for a Flutter Android companion and a tiny local API. The current MVP keeps the backend surface small so the team can build quickly and stay aligned.

## MVP

- `apps/api` owns the local Fastify API.
- `GET /health` checks that the server is up.
- `POST /prompt` accepts one required `screenMedia` upload plus at least one of `promptText` or raw `promptAudio`.
- The frontend forwards raw audio without client-side transcription.
- The API returns a synchronous JSON result.

## One-command API tunnel

Run `./scripts/start-api-ngrok.sh` from the repo root to start the API and publish it through `ngrok`.

- The command prints the public URL.
- It syncs that URL into the repo-level `.env` as `OPEN_BUBBLE_API_BASE_URL`.
- Frontend setup details live in `docs/guides/frontend-api-server.md`.

## Repository shape

```text
open-bubble/
  apps/
    api/             # Fastify API MVP and local docs
    mobile/          # Flutter Android app
  docs/
    api/             # OpenAPI contract and examples
    guides/          # Frontend / local workflow guides
    specs/           # Short MVP notes
    adr/             # Architecture decision records
  .github/           # PR template / collaboration hygiene
```

## Working notes

- Read `AGENTS.md` before starting work.
- Keep API changes in sync with `docs/api/openapi.yaml`.
- Keep the docs short and remove outdated detail instead of layering on new active scope.
