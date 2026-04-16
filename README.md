# Open Bubble

Open Bubble is a hackathon prototype for a Flutter-first Android companion bubble that can sit over the phone UI, talk to a local/team app server, send screenshot + audio prompts to be answered from local directory context, and surface agent-completion notifications as a floating bubble.

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

A user opens the Flutter app, sees a draggable Open Bubble, sends a screenshot + audio prompt to the server, gets an answer grounded in the selected session's local directory context, and receives answer/status/done events back through the bubble.

## Team starting points

- Read [`AGENTS.md`](AGENTS.md) for repo-specific agent and contributor guidance.
- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch/PR workflow.
- Read [`docs/specs/product-scope.md`](docs/specs/product-scope.md) for MVP boundaries.
- Read [`docs/specs/application-understanding.md`](docs/specs/application-understanding.md) for the current mental model of the app.
- Read [`docs/specs/user-journeys.md`](docs/specs/user-journeys.md) for the expected user flows.
- Read [`docs/specs/team-collaboration.md`](docs/specs/team-collaboration.md) for workstream ownership.
- Use [`docs/api/openapi.yaml`](docs/api/openapi.yaml) and [`docs/api/events.md`](docs/api/events.md) as the shared contract between mobile, server, and agent adapters.
- Log architectural decisions in [`docs/adr/`](docs/adr/).

## Suggested hackathon flow

1. Agree on the API contract.
2. Stub server responses against the contract.
3. Build Flutter UI screens against mocked/server data.
4. Add the context request composer: screenshot + audio prompt with typed/mock fallbacks.
5. Add Android platform-channel hooks for overlay, screenshot capture, and audio prompt capture as time allows.
6. Wire agent/backend answers and status events into the server event stream.
7. Run the demo script in [`docs/specs/demo-plan.md`](docs/specs/demo-plan.md).
