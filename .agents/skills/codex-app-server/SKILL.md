---
name: codex-app-server
description: Use when working on the Open Bubble App Server, its REST/SSE contract, server specs, or Codex-agent integration paths under apps/server, docs/api, docs/specs/server.md, or apps/codex-agent.
---

# Codex App Server

Use this skill for Open Bubble App Server work: REST endpoints, SSE events, in-memory session/request state, backend-agent adapter boundaries, and the Codex context-answer launch path.

## Source of Truth

Read these before changing behavior:

- `docs/specs/server.md` — App Server responsibilities, storage stance, and context request semantics.
- `docs/api/openapi.yaml` — REST contract.
- `docs/api/events.md` — event names and payload rules.
- `docs/api/examples/` — sample request, response, and event payloads.
- `apps/codex-agent/AGENTS.md` — contract for spawned Codex context-answer agents.

## Contract-First Workflow

1. Identify whether the change affects REST shape, event shape, sample payloads, or implementation only.
2. If behavior changes, update contracts first:
   - `docs/api/openapi.yaml` for REST endpoints, schemas, status codes, or response bodies.
   - `docs/api/events.md` for event names, producer/consumer behavior, or event payload semantics.
   - `docs/api/examples/*.json` for affected sample payloads.
   - `docs/specs/server.md` or related specs for behavior and architecture rationale.
3. Only then edit `apps/server/` implementation files.
4. Keep the first implementation simple: REST + SSE + in-memory state.
5. Do not add auth, persistence, deployment infrastructure, queues, or new dependencies unless the demo explicitly requires them and the reason is documented.

## Context Request Rules

`POST /v1/sessions/{sessionId}/context-requests` is the primary phone-to-agent question flow.

- Inputs are screenshot data/metadata plus audio transcript or typed prompt fallback.
- The answer must be generated from selected session context: local state, local files, direct DuckDB context graph reads, or slower agent reasoning.
- Return `200` with `answer` when a fast local/DuckDB answer is available.
- Return `202` when slower adapter/Codex work is needed, then publish progress/final SSE events.
- Use `context.answer.partial` only for intermediate visible answer updates.
- Use `context.answer.ready` for normal final answers.
- Use `code.assertion.requested` / `code.assertion.ready` only when the user explicitly requested code assertion, verification, safety checking, or claim checking.

## Codex Agent Integration

When the server needs a Codex-backed answer:

1. Launch or manage Codex with `apps/codex-agent/` as the working directory.
2. Pass request JSON through one of:
   - `OPEN_BUBBLE_CONTEXT_REQUEST`
   - `OPEN_BUBBLE_CONTEXT_REQUEST_FILE`
3. Set `OPEN_BUBBLE_RESPONSE_FILE` when the server wants a file handoff; otherwise capture stdout.
4. Optionally set `OPEN_BUBBLE_CONTEXT_DB` and `OPEN_BUBBLE_SESSION_ID`.
5. Expect a JSON object compatible with the `ContextAnswer` schema.

The MVP may read DuckDB directly from the server/agent context layer. Do not introduce a Bun CLI, bridge service, or durable tool protocol until direct access becomes too slow, repetitive, or hard to share.

## Implementation Shape

Prefer these boundaries when server code exists:

- `api/` — route handlers and request/response mapping.
- `domain/` — session, event, context-request models and validation.
- `store/` — in-memory state for sessions, requests, and events.
- `events/` or equivalent — SSE fan-out and event log.
- `adapters/` — backend agent and Codex launch integration.
- `context/` — direct local context and DuckDB lookup helpers.

Keep mobile decoupled from backend agent runtimes; mobile talks to the App Server only.

## Verification

For docs-only changes:

- Parse changed JSON examples.
- Parse `docs/api/openapi.yaml` when touched.
- Run `git diff --check`.

For implementation changes, also run the server's formatter, typecheck, tests, and any contract tests once those scripts exist.
