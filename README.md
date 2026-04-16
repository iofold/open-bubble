# Open Bubble

Open Bubble is a docs-first hackathon repo for a Flutter Android companion, a tiny local API, and future Codex-backed context-answer workflows. The current MVP keeps the active backend surface small so the team can move quickly and stay aligned.

## MVP

- `apps/api` owns the local Fastify API.
- `GET /health` checks that the server is up.
- `POST /prompt` accepts one required `screenMedia` upload plus at least one of `promptText` or raw `promptAudio`.
- The frontend forwards raw audio without client-side transcription.
- The API returns a synchronous JSON result.

## Repository shape

```text
open-bubble/
  apps/
    api/             # Fastify API MVP and local docs
    mobile/          # Flutter Android app
    server/          # Retired path; active server work now lives in apps/api
    agent-adapters/  # Future backend integration work
    codex-agent/     # Spawn cwd for App Server-managed Codex context-answer agents
  docs/
    api/             # OpenAPI contract, examples, and future async notes
    specs/           # Short MVP notes
    adr/             # Architecture decision records
  .github/           # PR template / collaboration hygiene
```

## Working notes

- Read `AGENTS.md` before starting work.
- Keep API changes in sync with `docs/api/openapi.yaml`.
- Keep the docs short and remove outdated detail instead of layering on new active scope.
