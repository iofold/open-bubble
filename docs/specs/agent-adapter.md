# Agent Adapter Spec

## Role

Agent adapters connect whatever backend agent runtime the team uses to the Open Bubble App Server contract.

## MVP responsibilities

- Discover or register active sessions.
- Maintain or access local directory context for a session.
- Accept phone-originated screenshot + audio/typed prompt context requests.
- Answer context requests using local directory context.
- Treat outgoing code assertion/verification as a special mode only when explicitly requested by the user prompt.
- Emit events when an answer is ready, an agent changes status, or an agent finishes work.

## Adapter boundary

Adapters should call the App Server; the Flutter app should not call agent runtimes directly.

## Context answer flow

1. App Server receives `POST /v1/sessions/{sessionId}/context-requests`.
2. Adapter receives or polls the request.
3. Adapter combines:
   - screenshot/visual context from the phone,
   - audio transcript or typed prompt,
   - local working directory context,
   - current agent/session state.
4. Adapter produces an answer.
5. Adapter publishes `context.answer.ready` or `code.assertion.ready`.

## Initial event mapping

| Agent/runtime event | Open Bubble event |
| --- | --- |
| Session started | `session.started` |
| Session context changed | `session.context.updated` |
| Phone context request submitted | `context.requested` |
| Local-context answer ready | `context.answer.ready` |
| Explicit code assertion requested | `code.assertion.requested` |
| Code assertion result ready | `code.assertion.ready` |
| Agent asks for user context | `agent.input.requested` |
| Agent task completed | `agent.done` |
| Agent failed or blocked | `agent.error` |

## Open questions

- Which agent runtimes are in scope for the demo?
- Can sessions be discovered automatically, or do we manually register demo sessions?
- What exact local directory context is available: files, git diff, tests, recent messages, logs, current task?
- Will speech-to-text run on mobile, server, adapter, or be mocked with typed transcript for demo?
