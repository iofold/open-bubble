# AGENTS.md — Open Bubble repo guidance

Open Bubble is in a docs-first MVP phase. Keep the active story focused on the local API in `apps/api` and avoid reintroducing broader scope unless the contract changes first.

## Source of truth

- `docs/api/openapi.yaml`
- `docs/api/examples/`
- `docs/specs/server.md`

## Layout

```text
apps/
  api/             Fastify API MVP
  mobile/          Flutter Android app
  agent-adapters/  Future backend integration work
docs/
  api/             OpenAPI contract and examples
  specs/           Short MVP notes
```

## Rules

- Keep Node.js, TypeScript, build, and test tooling inside `apps/api/`.
- Use strict TypeScript for the API MVP.
- Keep the API limited to `GET /health` and `POST /prompt` until the contract is updated.
- `POST /prompt` uses multipart/form-data with required `screenMedia`, optional `promptText`, optional raw `promptAudio`, and at least one prompt field.
- Keep docs brief and prefer removing stale scope over documenting old flows.
- Update the API contract before changing API behavior.
