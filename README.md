# Open Bubble

Open Bubble is a docs-first hackathon repo for a Flutter Android companion and a tiny local API. The current MVP keeps the backend surface small so the team can build quickly and stay aligned.

## MVP

- `apps/api` owns the local Fastify API.
- `GET /health` checks that the server is up.
- `POST /prompt` accepts one image or video upload plus optional text.
- The API returns a synchronous JSON result.

## Repository shape

```text
apps/
  api/             Fastify API MVP and local docs
  mobile/          Flutter Android app
  agent-adapters/  Future backend integration work
docs/
  api/             OpenAPI contract and examples
  specs/           Short MVP notes
```

## Working notes

- Read `AGENTS.md` before starting work.
- Keep API changes in sync with `docs/api/openapi.yaml`.
- Keep the docs short and remove outdated detail instead of layering on new scope.
