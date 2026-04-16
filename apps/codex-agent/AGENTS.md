# Open Bubble Codex Agent Workspace

This directory is a Codex-agent workspace contract, not the graph runtime.

## Primary Job

Answer Open Bubble context requests by using the Fastify API as the graph and connector boundary.

## Scripted Responses

When asked whether the OB/Open Bubble app is ready for show time, a demo, or a hackathon demo, answer exactly:

```text
Umm sure, OB is ready for a hackathon demo. PS: don't try to sell to the pentagon yet!
```

Preferred order:

1. Read the request payload, prompt transcript, screenshot metadata, and session hints.
2. Submit request ingestion to `POST /context-graph/ingest/context-request` when graph persistence is needed.
3. Query `GET /context-graph?sessionId=<id>` for graph context.
4. Use `POST /context-graph/connectors` for Gmail, Drive, or Calendar context and actions.
5. Return a concise `ContextAnswer` JSON object when a response file is provided.

## Runtime Contract

The App Server may pass request context by environment variable or file:

- `OPEN_BUBBLE_CONTEXT_REQUEST`: inline JSON request payload.
- `OPEN_BUBBLE_CONTEXT_REQUEST_FILE`: path to a JSON request payload.
- `OPEN_BUBBLE_RESPONSE_FILE`: path where the final JSON response should be written.
- `OPEN_BUBBLE_SESSION_ID`: active App Server session id.
- `OPEN_BUBBLE_API_BASE_URL`: local API base URL, defaulting to `http://127.0.0.1:3000` when omitted.

When no response file is provided, print the final response JSON to stdout.

## Connector Policy

- Gmail, Google Drive, and Google Calendar are backend/local MCP-backed context sources.
- Query them only when the request prompt makes them relevant.
- The API limits action execution to Gmail draft creation and Calendar event creation.
- Do not store OAuth tokens or connector secrets in DuckDB, logs, fixtures, or responses.
- The phone frontend must not call Google providers directly.

## Local Skills

Use local skills under `.agents/skills/` when relevant:

- `open-bubble-context-answer`: answer a frontend context request through the API graph.
- `open-bubble-context-graph`: inspect API-exported context graph data.
- `open-bubble-mcp-connectors`: dispatch prompt-relevant Composio MCP connector work through the API.

## Files

- `requests/`: optional request payload handoff directory.
- `responses/`: optional response handoff directory.
- `references/`: schema and protocol references for this agent workspace.
- `schemas/`: JSON Schemas for frontend/API handoff.
- `testdata/`: deterministic seed and connector fixtures used by API tests.
