# Event Contract

Mobile should treat App Server events as append-only notifications. Server can send them over SSE (`GET /v1/events/stream`) and expose the same payloads through polling (`GET /v1/events`).

Every event should be correlated with a `requestId` when it belongs to a capture / reply / fill flow.

## SSE format

```text
event: assistant.reply.ready
data: {"id":"evt_123","type":"assistant.reply.ready","sessionId":"sess_123","requestId":"req_123","title":"Reply ready","message":"Insurance policy details prepared","severity":"success","createdAt":"2026-04-16T06:30:00Z"}
```

## Event types

| Type | Producer | Consumer behavior |
| --- | --- | --- |
| `session.started` | Agent adapter/server | Add or refresh session list |
| `session.context.updated` | Agent adapter/server | Refresh visible session context |
| `capture.accepted` | Server | Mark request as queued / accepted |
| `request.updated` | Server | Refresh pending request state |
| `assistant.reply.ready` | Agent adapter/server | Show reply-ready state and reveal review UI |
| `fill.preview.ready` | Agent adapter/server | Show locally reviewable fill suggestion |
| `agent.done` | Agent adapter/server | Bubble should show success/completion message |
| `agent.error` | Agent adapter/server | Bubble should show warning/error state |

## Delivery notes

- `requestId` should remain stable from the mobile capture submission through the final reply or error.
- `sessionId` should always be present when the event is tied to a known backend session.
- The mobile client should handle both SSE and polling with the same payload shape.

## Sample payloads

See `docs/api/examples/` for copy-paste payloads used by mobile/server during development.
