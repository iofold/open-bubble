# App Server Spec

## Role

The App Server is the contract boundary between the Flutter app and backend agents. It should be simple enough for the hackathon demo but structured so mobile, server, and adapter work can proceed independently.

## Responsibilities

- Maintain a list of active agent sessions.
- Expose session context summaries to mobile.
- Receive screenshot/context payloads from mobile.
- Relay backend agent status/completion events to mobile.
- Provide stable sample payloads for mobile development.

## MVP transport

- REST for request/response actions.
- Server-Sent Events (SSE) for one-way event notifications to mobile.
- JSON payloads only for the first pass.

## Storage

Start with in-memory storage. Add file or database persistence only if the demo needs restart survival.

## Suggested server modules later

```text
apps/server/
  src/
    index.*          # boot server
    api/             # routes/controllers
    domain/          # session/event models
    adapters/        # backend agent integrations
    store/           # in-memory persistence
  test/              # API contract tests
```

## Contract discipline

- `docs/api/openapi.yaml` is the source of truth for REST endpoints.
- `docs/api/events.md` is the source of truth for event names and payloads.
- Server implementation should include contract tests before mobile depends on changed behavior.
