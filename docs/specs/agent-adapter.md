# Agent Adapter Spec

## Role

Agent adapters connect whatever backend agent runtime the team uses to the Open Bubble App Server contract.

## MVP responsibilities

- Discover or register active sessions.
- Produce a compact context summary for a session.
- Accept phone-originated screenshot/context uploads and attach them to the right session.
- Emit events when an agent changes status or finishes work.

## Adapter boundary

Adapters should call the App Server; the Flutter app should not call agent runtimes directly.

## Initial event mapping

| Agent runtime event | Open Bubble event |
| --- | --- |
| Session started | `session.started` |
| Session context changed | `session.context.updated` |
| Agent asks for user context | `agent.input.requested` |
| Agent task completed | `agent.done` |
| Agent failed or blocked | `agent.error` |

## Open questions

- Which agent runtimes are in scope for the demo?
- Can sessions be discovered automatically, or do we manually register demo sessions?
- What is the smallest useful context summary: task, cwd, last message, files touched, status?
