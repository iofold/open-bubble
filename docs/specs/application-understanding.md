# MVP Understanding

The current MVP is a local Fastify API in `apps/api` with four endpoints:

- `GET /health`
- `GET /apps`
- `POST /prompt`
- `GET /tasks/{taskId}`

`GET /apps` returns a static list of supported app names: `Codex`, `Gmail`, `Gcal`, `Slack`, and `Notion`.

`POST /prompt` accepts one `screenMedia` upload plus at least one of `promptText` or raw `promptAudio`, then returns a task handle immediately. The client does not transcribe audio; it forwards the bytes as-is and polls `GET /tasks/{taskId}` for `in_progress`, `completed`, `failed`, or `error`.

The current async processor classifies the screenshot-led request into one of three buckets:

- `coding_request`
- `personal_context_request`
- `action_request`

When the classifier can tie the request to supported tools or data sources, it also returns one or more app names from the static `GET /apps` list and packages the stored screenshot path, original prompt fields, and classification into a routing payload for later execution. Coding requests also persist a default fallback working directory under repo-root `tmp/`.

## Backend Context Extension

`apps/codex-agent` is an adjacent local workspace for richer context graph experiments. It is not the active API dispatcher.

The Codex-agent workspace can:

1. Ingest frontend-style screenshot + prompt requests into DuckDB.
2. Normalize fixture or live MCP connector results from Gmail, Google Drive, and Google Calendar.
3. Store connector-derived context as episodes, entities, facts, and searchable chunks.
4. Export graph JSON for a local control panel.
5. Produce `ContextAnswer` JSON from the graph.

## Connector Boundary

Gmail, Drive, and Calendar are backend/local context sources. The Flutter app should not call those providers directly. When live MCP connectors are wired, the local Codex/App Server/API side should fetch minimized snippets and ingest them into the context graph with provenance.

## Control Panel Boundary

The graph control panel is a local developer/operator view for inspecting DuckDB graph exports. It is not the Android bubble surface and does not replace the API MVP.

## Current Actors

| Actor | Role |
| --- | --- |
| Flutter mobile app | Captures screen media and prompt text/audio, then calls `apps/api`. |
| Native Android layer | Handles Android-only capabilities behind Flutter platform channels. |
| API | Local Fastify API with `GET /health`, `GET /apps`, `POST /prompt`, and `GET /tasks/{taskId}`. |
| Codex agent workspace | Local graph/context experiments, connector normalization, graph export, and future answer generation path. |
| MCP connectors | Local backend-side sources for Gmail, Drive, and Calendar context. |
| Graph control panel | Local static UI for inspecting exported context graph JSON. |

## Current Open Decisions

- How `apps/api` will dispatch to `apps/codex-agent` scripts once the simple `/prompt` MVP is stable.
- Exact live MCP tool names for Gmail, Drive, and Calendar.
- How long connector-derived snippets should live in local DuckDB.
- Whether the static graph panel remains under `apps/codex-agent` or moves to a future app once API graph endpoints exist.
