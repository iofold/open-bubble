# Agent Adapters Placeholder

Backend/Codex-agent adapter code and scripts will live here.

Adapters should call the App Server API instead of coupling directly to the Flutter app.

For Codex-backed answers, adapters should spawn or manage Codex with `apps/codex-agent/` as the working directory. This directory is the integration layer; `apps/codex-agent/` is the agent workspace.

Start with a demo adapter that can:

1. Register a fake session.
2. Publish a context update.
3. Publish an `agent.done` event.
