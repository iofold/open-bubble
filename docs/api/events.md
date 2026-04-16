# Event Contract

Mobile should treat App Server events as append-only notifications. Server can send them over SSE (`GET /v1/events/stream`) and expose the same payloads through polling (`GET /v1/events`).

## SSE format

```text
event: context.answer.ready
data: {"id":"evt_123","type":"context.answer.ready","sessionId":"sess_123","contextRequestId":"ctx_req_123","title":"Answer ready","message":"The agent is blocked waiting for Android screenshot permissions.","severity":"info","createdAt":"2026-04-16T06:30:00Z"}
```

## Event types

| Type | Producer | Consumer behavior |
| --- | --- | --- |
| `session.started` | Agent adapter/server | Add or refresh session list |
| `session.context.updated` | Agent adapter/server | Refresh passive/debug session context |
| `context.requested` | Server | Mark a screenshot + audio prompt request as submitted |
| `context.answer.ready` | Agent adapter/server | Show the answer in session detail and optionally the bubble |
| `code.assertion.requested` | Server/adapter | Mark an explicitly requested code assertion as submitted |
| `code.assertion.ready` | Agent adapter/server | Show code assertion result with confidence/uncertainty |
| `screenshot.received` | Server | Show upload confirmation if relevant for legacy/screenshot-only flow |
| `agent.input.requested` | Agent adapter | Bubble should prompt user to open app and send screenshot/audio context |
| `agent.done` | Agent adapter | Bubble should show success/completion message |
| `agent.error` | Agent adapter | Bubble should show warning/error state |

## Code assertion guardrail

`code.assertion.requested` and `code.assertion.ready` should only appear when the user's prompt explicitly asks for code assertion, verification, safety check, or claim checking. Generic context requests should use `context.requested` and `context.answer.ready`.

## Sample payloads

See `docs/api/examples/` for copy-paste payloads used by mobile/server during development.
