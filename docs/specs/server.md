# App Server Spec

## Role

The App Server is the contract boundary between the Flutter app and backend agents. It should be simple enough for the hackathon demo but structured so mobile, server, and adapter work can proceed independently.

## Responsibilities

- Maintain a list of active agent sessions.
- Accept screenshot + audio/typed prompt context requests from mobile.
- Route context requests to the relevant adapter/backend agent.
- Return or stream answers produced from local directory context.
- Preserve passive session context summaries for debug/session detail.
- Relay backend agent status/completion events to mobile.
- Provide stable sample payloads for mobile development.

## Context request semantics

`POST /v1/sessions/{sessionId}/context-requests` is the primary "fetch context" action. It represents the user asking a question with phone-side screenshot/audio prompt. The answer should be generated from the selected session's local directory context.

The server should not treat every request as a code assertion. A request is a code assertion only when the user explicitly asks for assertion/verification in the audio prompt, transcript, or typed prompt.

## MVP transport

- REST for request/response actions.
- Server-Sent Events (SSE) for one-way answer/status notifications to mobile.
- JSON payloads only for the first pass.
- Base64 media payloads are acceptable for the demo; optimize storage/uploads later if needed.

## Storage

Start with in-memory storage. Add file or database persistence only if the demo needs restart survival.

## Suggested server modules later

```text
apps/server/
  src/
    index.*          # boot server
    api/             # routes/controllers
    domain/          # session/event/request models
    adapters/        # backend agent integrations
    store/           # in-memory persistence
  test/              # API contract tests
```

## Contract discipline

- `docs/api/openapi.yaml` is the source of truth for REST endpoints.
- `docs/api/events.md` is the source of truth for event names and payloads.
- Server implementation should include contract tests before mobile depends on changed behavior.
