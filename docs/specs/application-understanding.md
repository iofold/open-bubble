# MVP Understanding

The current MVP is a local Fastify API in `apps/api` with prompt endpoints plus API-owned context graph endpoints:

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

`apps/codex-agent` is now an adjacent instruction/schema/fixture workspace. It is not the graph runtime.

The API graph runtime can:

1. Ingest frontend-style screenshot + prompt requests into DuckDB.
2. Normalize fixture or live MCP connector results from Gmail, Google Drive, and Google Calendar.
3. Store connector-derived context as episodes, entities, facts, and searchable chunks.
4. Dispatch prompt-relevant Composio MCP reads and the limited action lane.
5. Produce `ContextAnswer` JSON from the graph.

## Connector Boundary

Gmail, Drive, and Calendar are backend/local context sources. The Flutter app should not call those providers directly. When live MCP connectors are configured, the API fetches minimized snippets and ingests them into the context graph with provenance.

The only allowed action tools for now are Gmail draft creation and Google Calendar event creation.

## Control Panel Boundary

The graph control panel is a React developer/operator view for inspecting API graph snapshots. It is not the Android bubble surface and does not replace the API MVP.

## Current Actors

| Actor | Role |
| --- | --- |
| Flutter mobile app | Captures screen media and prompt text/audio, then calls `apps/api`. |
| Native Android layer | Handles Android-only capabilities behind Flutter platform channels. |
| API | Local Fastify API with prompt, task, graph, connector, and control-panel routes. |
| Codex agent workspace | Local instructions, schemas, references, and graph fixtures. |
| Composio MCP connectors | Local backend-side sources/actions for Gmail, Drive, and Calendar context. |
| Graph control panel | React UI for inspecting API graph snapshots. |

## Current Open Decisions

- How long connector-derived snippets should live in local DuckDB.
- Whether the control panel can purge connector-derived data by connector, time range, or session.
