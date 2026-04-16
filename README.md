# Open Bubble

Open Bubble is a docs-first hackathon repo for a Flutter Android companion, a tiny local API, and a local Codex-agent context graph workspace. The current MVP keeps the backend surface small so the team can build quickly and stay aligned.

## MVP

- `apps/api` owns the local Fastify API.
- `GET /health` checks that the server is up.
- `POST /prompt` accepts one required `screenMedia` upload plus at least one of `promptText` or raw `promptAudio`, then creates a lightweight async task.
- `GET /tasks/:taskId` lets the client poll task state and fetch the result later.
- Completed prompt tasks now include a structured request classification plus a routing payload for later app-specific handling.
- Coding classifications also record a default local fallback workspace under repo-root `tmp/` for a future execution handoff.
- The frontend forwards raw audio without client-side transcription.
- The API returns a task handle immediately instead of blocking for the final result.

## One-command API tunnel

Run `./scripts/start-api-ngrok.sh` from the repo root to start the API and publish it through `ngrok`.

- The command prints the public URL.
- It syncs that URL into the repo-level `.env` as `OPEN_BUBBLE_API_BASE_URL`.
- Frontend setup details live in `docs/guides/frontend-api-server.md`.

## Codex Agent Context Graph

`apps/codex-agent` contains the local Codex-agent workspace for context graph experiments:

- screenshot + prompt request ingestion,
- DuckDB graph fixtures,
- Gmail/Drive/Calendar MCP result normalization,
- graph export JSON,
- a static local graph control panel.

This workspace is intentionally decoupled from `apps/api` dispatch. The API can call the scripts later through file/JSON handoffs.

## Repository shape

```text
open-bubble/
  apps/
    api/             # Fastify API MVP and local docs
    mobile/          # Flutter Android app
    codex-agent/     # Codex-agent context graph workspace
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
- Read `docs/specs/mcp-connectors.md` before changing Gmail/Drive/Calendar connector behavior.
- Read `docs/specs/graph-control-panel.md` before changing the graph inspection UI.
