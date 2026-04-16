# DuckDB Context Schema

This is the MVP reference shape for the API-owned DuckDB context graph. Agents should query through the Fastify API unless they are running low-level database diagnostics.

## Preferred Tables

### `session_context`

Current session facts.

| Column | Type | Notes |
| --- | --- | --- |
| `session_id` | `VARCHAR` | App Server session id |
| `key` | `VARCHAR` | Fact key, for example `current_task` |
| `value` | `VARCHAR` or `JSON` | Fact payload |
| `updated_at` | `TIMESTAMP` | Last update |

### `graph_entities`

Context graph nodes.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `VARCHAR` | Stable entity id |
| `session_id` | `VARCHAR` | Optional session scope |
| `type` | `VARCHAR` | Entity type |
| `name` | `VARCHAR` | Display name |
| `description` | `VARCHAR` | Searchable summary |
| `metadata` | `JSON` | Additional fields |
| `updated_at` | `TIMESTAMP` | Last update |

### `graph_relations`

Context graph edges.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `VARCHAR` | Stable relation id |
| `source_id` | `VARCHAR` | Entity id |
| `target_id` | `VARCHAR` | Entity id |
| `type` | `VARCHAR` | Relation type |
| `weight` | `DOUBLE` | Optional ranking signal |
| `metadata` | `JSON` | Additional fields |

### `context_chunks`

Searchable local context chunks.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `VARCHAR` | Stable chunk id |
| `session_id` | `VARCHAR` | Optional session scope |
| `source` | `VARCHAR` | File, message, log, screenshot metadata, etc. |
| `text` | `VARCHAR` | Chunk text |
| `embedding` | `FLOAT[]` or fixed-size array | Optional vector value |
| `updated_at` | `TIMESTAMP` | Last update |

The current MVP script stores `metadata` instead of `embedding` until vector extension setup is implemented.

### `context_requests`

Raw frontend request intake.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `VARCHAR` | Context request id |
| `session_id` | `VARCHAR` | App Server session id |
| `device_id` | `VARCHAR` | Phone/device id |
| `intent` | `VARCHAR` | Client-provided intent |
| `classified_intent` | `VARCHAR` | `fetch_response`, `ingest_only`, or `code_assertion` |
| `transcript` | `VARCHAR` | Voice transcript or typed fallback |
| `screenshot_summary` | `VARCHAR` | Metadata/vision summary |
| `raw_json` | `VARCHAR` | Original request JSON |
| `created_at` | `TIMESTAMP` | Client or ingest timestamp |
| `updated_at` | `TIMESTAMP` | Last ingest timestamp |

## Query Guidance

- Start with `GET /context-graph?sessionId=<id>`.
- Use `graph_entities` and `graph_relations` for named entities, files, tasks, and evidence chains.
- Use `sourceEpisodeId` to cite provenance.
- Keep any direct DuckDB inspection to API diagnostics, not normal agent request handling.
