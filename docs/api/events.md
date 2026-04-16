# Event Contract

Mobile should treat App Server events as append-only notifications. Server can send them over SSE (`GET /v1/events/stream`) and expose the same payloads through polling (`GET /v1/events`).

## SSE format

```text
event: agent.done
data: {"id":"evt_123","type":"agent.done","sessionId":"sess_123","title":"Agent finished","message":"Patch ready","severity":"success","createdAt":"2026-04-16T06:30:00Z"}
```

## Event types

| Type | Producer | Consumer behavior |
| --- | --- | --- |
| `session.started` | Agent adapter/server | Add or refresh session list |
| `session.context.updated` | Agent adapter/server | Refresh visible session context |
| `screenshot.received` | Server | Show upload confirmation if relevant |
| `agent.input.requested` | Agent adapter | Bubble should prompt user to open app |
| `agent.done` | Agent adapter | Bubble should show success/completion message |
| `agent.error` | Agent adapter | Bubble should show warning/error state |

## Sample payloads

See `docs/api/examples/` for copy-paste payloads used by mobile/server during development.
