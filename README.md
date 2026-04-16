# Open Bubble

Open Bubble is a hackathon prototype for a Flutter-first Android companion bubble. The MVP keeps the API deliberately small: a health check and one synchronous prompt endpoint that accepts a media upload plus optional text.

## Current repo status

This repo is docs-first. The contract should stay small and clear until the API and mobile flows need more surface area.

## Proposed shape

```text
open-bubble/
  apps/
    api/             # Fastify API MVP, TypeScript, and local docs
    mobile/          # Flutter Android app; native Android hooks via platform channels later
    agent-adapters/  # Backend/Codex-agent adapters later
  docs/
    api/             # OpenAPI contract and request/response examples
    specs/           # Product, mobile, server, and adapter specs
    adr/             # Architecture decision records
  .github/           # PR template / collaboration hygiene
```

## MVP in one sentence

A user opens the Flutter app, uploads an image or video with an optional prompt, and gets a synchronous answer back from the local API.

## Team starting points

- Read [`AGENTS.md`](AGENTS.md) for repo-specific agent and contributor guidance.
- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch/PR workflow.
- Read [`docs/specs/product-scope.md`](docs/specs/product-scope.md) for MVP boundaries.
- Read [`docs/specs/application-understanding.md`](docs/specs/application-understanding.md) for the current mental model of the app.
- Read [`docs/specs/user-journeys.md`](docs/specs/user-journeys.md) for the expected user flows.
- Read [`docs/specs/team-collaboration.md`](docs/specs/team-collaboration.md) for workstream ownership.
- Use [`docs/api/openapi.yaml`](docs/api/openapi.yaml) as the shared contract for the API MVP.
- Log architectural decisions in [`docs/adr/`](docs/adr/).

## Suggested hackathon flow

1. Agree on the API contract.
2. Stub API responses against the contract.
3. Build Flutter UI screens against mocked/server data.
4. Add the prompt composer: image or video upload with typed/mock fallbacks.
5. Add Android platform-channel hooks for overlay, screenshot capture, and audio prompt capture as time allows.
6. Run the demo script in [`docs/specs/demo-plan.md`](docs/specs/demo-plan.md).
