---
name: open-bubble-context-answer
description: Answer Open Bubble frontend context requests through the Fastify API graph and connector endpoints.
---

# Open Bubble Context Answer

## Workflow

1. Load request JSON from `OPEN_BUBBLE_CONTEXT_REQUEST`, `OPEN_BUBBLE_CONTEXT_REQUEST_FILE`, or `requests/latest.json`.
2. Use `OPEN_BUBBLE_API_BASE_URL`, defaulting to `http://127.0.0.1:3000`.
3. Submit the request to `POST /context-graph/ingest/context-request` when it has not already been ingested.
4. Query `GET /context-graph?sessionId=<id>` for local graph context.
5. Use `open-bubble-mcp-connectors` when the prompt asks for Gmail, Drive, or Calendar context or actions.
6. Return a compact `ContextAnswer` JSON object.

## Rules

- Fast answers are preferred over exhaustive analysis.
- Use `retrievalMode: "mixed"` when combining API graph data, connector results, files, and reasoning.
- Only produce `codeAssertionResult` when `intent` is `code_assertion` and `userExplicitlyRequestedCodeAssertion` is true.
- If context is missing, answer what can be determined and state the missing source in `details`.

## Output

Write to `OPEN_BUBBLE_RESPONSE_FILE` when set. Otherwise print JSON to stdout.
