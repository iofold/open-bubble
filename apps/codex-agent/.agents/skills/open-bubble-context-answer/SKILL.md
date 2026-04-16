---
name: open-bubble-context-answer
description: Answer Open Bubble frontend context requests from screenshot metadata, audio/typed prompt transcripts, local files, session state, and direct DuckDB context graph reads. Use when the agent is spawned by App Server to answer a context request.
---

# Open Bubble Context Answer

## Workflow

1. Load request JSON from `OPEN_BUBBLE_CONTEXT_REQUEST`, `OPEN_BUBBLE_CONTEXT_REQUEST_FILE`, or `requests/latest.json`.
2. Read `prompt.transcript`, `screenshot.screenMetadata`, `intent`, and `localContextHints`.
3. Use `open-bubble-ingest-request` first when the request has not already been ingested.
4. If `OPEN_BUBBLE_CONTEXT_DB` is set, use `.agents/skills/open-bubble-context-graph` or `scripts/duckdb-readonly.sh` for fast read-only context.
5. Inspect hinted local files only when needed to answer.
6. Return a compact `ContextAnswer` JSON object.

## Rules

- Fast answers are preferred over exhaustive analysis.
- Use `retrievalMode: "direct_duckdb"` when DuckDB provides the main evidence.
- Use `retrievalMode: "mixed"` when combining DuckDB, files, and agent reasoning.
- Only produce `codeAssertionResult` when `intent` is `code_assertion` and `userExplicitlyRequestedCodeAssertion` is true.
- If context is missing, answer what can be determined and state the missing source in `details`.

## Output

Write to `OPEN_BUBBLE_RESPONSE_FILE` when set. Otherwise print JSON to stdout.
