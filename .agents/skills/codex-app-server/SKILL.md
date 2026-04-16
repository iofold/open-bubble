---
name: codex-app-server
description: Reference for Codex app-server protocol plus Open Bubble server-side integration guidance. Use when working on Codex app-server behavior, the future Open Bubble App Server path, its REST/SSE contract, or Codex-agent integration under apps/server, docs/api, docs/specs/server.md, or apps/codex-agent.
---

# Codex App Server

Use this skill for Codex app-server behavior and for future Open Bubble App Server work: REST endpoints, SSE events, in-memory session/request state, backend-agent adapter boundaries, and the Codex context-answer launch path.

## Reference

- Latest docs URL: `https://developers.openai.com/codex/app-server`
- Read `references/codex-app-server.md` first for the copied documentation snapshot.
- If the task depends on current behavior or there is any chance the documentation changed, verify against the latest docs URL above.
- Keep the copied reference snapshot intact unless explicitly asked to refresh it.

## Source of Truth

Read these before changing future server-side behavior:

- `docs/specs/server.md`
- `docs/api/openapi.yaml`
- `docs/api/events.md`
- `docs/api/examples/`
- `apps/codex-agent/AGENTS.md`

## Contract-First Workflow

1. Identify whether the change affects REST shape, event shape, sample payloads, or implementation only.
2. If behavior changes, update contracts first:
   - `docs/api/openapi.yaml` for REST endpoints, schemas, status codes, or response bodies.
   - `docs/api/events.md` for event names or async payload semantics.
   - `docs/api/examples/*.json` for affected sample payloads.
   - `docs/specs/server.md` or related specs for rationale and boundaries.
3. Only then edit implementation files.
4. Keep the first implementation simple.
5. Do not add auth, persistence, deployment infrastructure, queues, or new dependencies unless the demo explicitly requires them and the reason is documented.

## Current MVP Boundary

Right now, the active API contract is intentionally narrower than the future App Server path:

- `GET /health`
- `POST /prompt`
- synchronous JSON response
- required `screenMedia`
- at least one of `promptText` or raw `promptAudio`

Treat sessions, SSE, async answer delivery, and Codex agent orchestration as future scope until the contract is expanded again.

## Future App Server Direction

When that broader server path becomes active again:

- Launch or manage Codex with `apps/codex-agent/` as the working directory.
- Pass request JSON through environment variables or file handoff.
- Optionally use direct DuckDB reads for local context lookups.
- Keep mobile decoupled from backend agent runtimes.
