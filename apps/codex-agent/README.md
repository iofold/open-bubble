# Open Bubble Codex Agent Workspace

This directory is the working-directory contract for a future Codex agent spawned by the Open Bubble API. It no longer owns graph writes or Python helper scripts.

The canonical context graph runtime is the Fastify API in `apps/api`.

## Runtime Boundary

- The API owns DuckDB writes and live graph reads.
- The React control panel lives in `apps/control-panel`.
- The API serves the built control panel from `/control-panel/`.
- Composio MCP dispatch is exposed through `POST /context-graph/connectors`.
- Local Codex agents should call API endpoints instead of opening DuckDB directly.

## Request Contract

The App Server may still pass context request data to a future Codex process with:

- `OPEN_BUBBLE_CONTEXT_REQUEST`
- `OPEN_BUBBLE_CONTEXT_REQUEST_FILE`
- `OPEN_BUBBLE_RESPONSE_FILE`
- `OPEN_BUBBLE_SESSION_ID`

For the current implementation, submit context requests directly to:

```text
POST /context-graph/ingest/context-request
```

Submit normalized connector reads or use the Composio MCP dispatch endpoint:

```text
POST /context-graph/ingest/mcp-results
POST /context-graph/connectors
```

## Remaining Files

- `.agents/skills/`: local Codex skill instructions, updated to route through the API.
- `references/`: graph ontology and protocol notes.
- `schemas/`: JSON schema references for request, answer, graph export, and normalized MCP fetches.
- `testdata/`: deterministic JSON fixtures used by API tests.
- `data/`, `requests/`, and `responses/`: ignored local runtime handoff directories.
