---
name: open-bubble-context-graph
description: Inspect the Open Bubble local DuckDB context database directly for session context, graph entities, relations, and text chunks. Use for fast read-only retrieval before deeper agent reasoning.
---

# Open Bubble Context Graph

## Inputs

- `OPEN_BUBBLE_CONTEXT_DB`: path to the DuckDB database.
- `OPEN_BUBBLE_SESSION_ID`: optional session scope.

## Read Path

1. Confirm the database path exists.
2. List tables with `scripts/duckdb-readonly.sh "$OPEN_BUBBLE_CONTEXT_DB" "SHOW TABLES;"`.
3. Check preferred tables from `references/duckdb-context-schema.md`.
4. Query `session_context`, `context_chunks`, `graph_entities`, and `graph_relations` defensively.
5. Use text search first; vector search is optional until the schema and extension setup are implemented.

## Constraints

- Read-only queries only.
- Keep result sets small: use `LIMIT`.
- Do not assume every preferred table exists.
- If the DuckDB CLI is unavailable, use another installed DuckDB-capable runtime if present; otherwise fall back to local files/request metadata.
