# Open Bubble Codex Agent Workspace

This directory is intended to be used as the working directory for a Codex agent spawned or managed by the Open Bubble App Server.

## Primary Job

Answer Open Bubble context requests from the frontend quickly and concretely.

Input usually arrives as a JSON context request from the App Server. Prefer this order:

1. Read the request payload, prompt transcript, screenshot metadata, and session hints.
2. Ingest screenshot + voice-note observations into the local context graph when DuckDB is configured.
3. Classify whether the voice prompt asks for a response, code assertion, or ingest-only capture.
4. Query fast local context first: request metadata, session state, local files, and DuckDB.
5. Return a concise answer in the response schema when the classified intent requests one.
6. Use deeper Codex reasoning, skills, or sub-agents only when fast context is insufficient.

## Runtime Contract

The App Server may pass request context by environment variable or file:

- `OPEN_BUBBLE_CONTEXT_REQUEST`: inline JSON request payload.
- `OPEN_BUBBLE_CONTEXT_REQUEST_FILE`: path to a JSON request payload.
- `OPEN_BUBBLE_RESPONSE_FILE`: path where the final JSON response should be written.
- `OPEN_BUBBLE_CONTEXT_DB`: optional path to the local DuckDB context database.
- `OPEN_BUBBLE_SESSION_ID`: active App Server session id.

When no response file is provided, print the final response JSON to stdout.

Default local database path is `data/context.duckdb`.

## Response Shape

Return JSON compatible with the App Server `ContextAnswer` schema:

```json
{
  "summary": "Short answer for the bubble.",
  "details": "Optional detail for the session screen.",
  "confidence": "low|medium|high",
  "retrievalMode": "session_state|direct_duckdb|local_files|agent_reasoning|mixed",
  "localContextUsed": ["request", "duckdb:session_context"]
}
```

For explicit code assertion requests only, include `codeAssertionResult`.

## DuckDB Policy

- Treat direct DuckDB access as the MVP fast path.
- Use read-only queries for frontend context answers unless the task explicitly asks to update local context.
- Do not create a production tool bridge here yet.
- If DuckDB is missing or the schema is unknown, fall back to request/session/local-file context and explain the gap in `details`.

## Local Skills

Use local skills under `.agents/skills/` when relevant:

- `open-bubble-ingest-request`: ingest screenshot + voice prompt context into DuckDB and answer when requested.
- `open-bubble-context-answer`: answer a frontend context request.
- `open-bubble-context-graph`: inspect local DuckDB context graph data.

## Files

- `requests/`: optional request payload handoff directory.
- `responses/`: optional response handoff directory.
- `scripts/`: lightweight helpers; no required dependency install.
- `references/`: schema and protocol references for this agent workspace.
- `schemas/`: JSON Schemas for frontend/App Server handoff.
- `testdata/`: deterministic seed and request fixtures.
- `tests/`: local processor tests.
