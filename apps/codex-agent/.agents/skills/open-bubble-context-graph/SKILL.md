---
name: open-bubble-context-graph
description: Inspect the Open Bubble context graph through the Fastify API.
---

# Open Bubble Context Graph

## Inputs

- `OPEN_BUBBLE_API_BASE_URL`: API base URL, default `http://127.0.0.1:3000`.
- `OPEN_BUBBLE_SESSION_ID`: optional session scope.

## Read Path

1. Fetch `GET /context-graph?sessionId=<id>`.
2. Use connector filters only when the user asks for a specific connector.
3. Inspect `nodes`, `edges`, `episodes`, and `stats`.
4. Use `sourceEpisodeId` and node metadata for provenance.

## Constraints

- Do not open DuckDB directly from the agent workspace.
- Keep graph result sets scoped by session.
- Do not expose raw connector identifiers unless the frontend needs an internal deep link.
