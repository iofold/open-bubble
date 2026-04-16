# Open Bubble

Open Bubble is a docs-first hackathon repo for a Flutter Android companion, a tiny local API, and a local Codex bridge. The current MVP keeps the backend surface small so the team can build quickly and stay aligned.

## MVP

- `apps/api` owns the local Fastify API.
- `apps/codex-app-server` owns the local TypeScript bridge to `codex app-server`.
- `apps/codex-agent` holds local Codex-oriented assets and scripts used by the broader demo.
- `GET /health` checks that the server is up.
- `POST /prompt` accepts one required screenshot upload plus required `promptText`.
- The API calls the local Codex bridge, which infers the target repo from config and prompt hints, starts a Codex App Server turn, waits for completion, and returns PR metadata.
- The API returns a synchronous JSON result.

## Repository shape

```text
open-bubble/
  apps/
    api/             # Fastify API MVP and local docs
    codex-agent/     # Local Codex agent assets
    codex-app-server/# TypeScript bridge to codex app-server
    mobile/          # Flutter Android app
  docs/
    api/             # OpenAPI contract and examples
    specs/           # Short MVP notes
    adr/             # Architecture decision records
  .github/           # PR template / collaboration hygiene
```

## Working notes

- Read `AGENTS.md` before starting work.
- Keep API changes in sync with `docs/api/openapi.yaml`.
- Keep the docs short and remove outdated detail instead of layering on new active scope.
