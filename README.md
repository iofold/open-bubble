# Open Bubble

Open Bubble is a hackathon prototype for a Flutter-first Android companion bubble that can sit over the phone UI, talk to a local/team app server, fetch context from running backend agents, send screenshots or user context back to the backend, and surface agent-completion notifications as a floating bubble.

## Current repo status

This repo is intentionally docs-first right now. The first goal is to align the team on scope, API contracts, and ownership before writing app/server code.

## Proposed shape

```text
open-bubble/
  apps/
    mobile/          # Flutter Android app; native Android hooks via platform channels later
    server/          # App Server API + event relay later
    agent-adapters/  # Backend/Codex-agent adapters later
  docs/
    api/             # OpenAPI + event contracts
    specs/           # Product, mobile, server, and adapter specs
    adr/             # Architecture decision records
  .github/           # PR template / collaboration hygiene
```

## MVP in one sentence

A user opens the Flutter app, grants Android overlay/screenshot permissions, sees a draggable Open Bubble, sends a screenshot/context to the server, and receives agent status/done events back through the bubble.

## Team starting points

- Read [`docs/specs/product-scope.md`](docs/specs/product-scope.md) for MVP boundaries.
- Read [`docs/specs/team-collaboration.md`](docs/specs/team-collaboration.md) for workstream ownership.
- Use [`docs/api/openapi.yaml`](docs/api/openapi.yaml) and [`docs/api/events.md`](docs/api/events.md) as the shared contract between mobile, server, and agent adapters.
- Log architectural decisions in [`docs/adr/`](docs/adr/).

## Suggested hackathon flow

1. Agree on the API contract.
2. Stub server responses against the contract.
3. Build Flutter UI screens against mocked/server data.
4. Add Android platform-channel hooks for overlay and screenshot capture.
5. Wire agent backend events into the server event stream.
6. Run the demo script in [`docs/specs/demo-plan.md`](docs/specs/demo-plan.md).
