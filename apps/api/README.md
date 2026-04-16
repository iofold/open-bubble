# apps/api

Local Fastify API MVP for Codex Bubble.

## Commands

Run everything from inside `apps/api/`, unless you want the repo-level launcher.

```bash
npm install
npm --prefix ../control-panel install
npm run dev
npm run dev:ngrok
npm test
npm run typecheck
npm run build
```

From the repository root, `./scripts/start-api-ngrok.sh` installs missing API dependencies, starts the API server, opens an `ngrok` tunnel, prints the public URL, and syncs `OPEN_BUBBLE_API_BASE_URL` into the repo-level `.env`.

## Local endpoints

- `GET /health`
- `GET /apps`
- `POST /prompt`
- `GET /tasks/:taskId`
- `GET /context-graph`
- `GET /context-graph/stream`
- `POST /context-graph/seed`
- `POST /context-graph/ingest/mcp-results`
- `POST /context-graph/ingest/context-request`
- `POST /context-graph/connectors`
- `GET /control-panel/`
- `GET /documentation`
- `GET /openapi.json`

## Prompt request contract

`POST /prompt` uses `multipart/form-data` with:

- `screenMedia`: required file, `image/*` or `video/*`
- `promptText`: optional text field
- `promptAudio`: optional file, `audio/*`

At least one of `promptText` or `promptAudio` must be present.

The frontend forwards `promptAudio` bytes as-is. It does not transcribe them client-side.

## Prompt task flow

`POST /prompt` is asynchronous.

- The API validates the multipart payload and creates a lightweight local task.
- The response is `202 Accepted` with a `taskId`, `status`, and `statusUrl`.
- Clients poll `GET /tasks/:taskId` until the task reaches `completed`, `failed`, or `error`.
- Completed tasks include a request classification (`coding_request`, `personal_context_request`, or `action_request`) plus a routing payload that points at the stored media file and carries the original prompt fields forward.
- Coding classifications also persist a default fallback working directory under repo-root `tmp/` for a later execution handoff.
- Task state is persisted locally under `apps/api/.local/tasks/`.

## Classifier configuration

Set `OPENAI_API_KEY` before running the classifier-backed prompt processor.

Optional overrides:

- `OPEN_BUBBLE_CLASSIFIER_MODEL` defaults to `gpt-5.4`
- `OPEN_BUBBLE_CLASSIFIER_BASE_URL` defaults to `https://api.openai.com/v1`

## Context graph and control panel

The API owns DuckDB graph writes and reads. Set `OPEN_BUBBLE_CONTEXT_DB` to choose the graph database path.

The React control panel lives in `apps/control-panel`. `npm run build` builds it before compiling the API, and the API serves the built app from `/control-panel/`.

For separate UI development:

```bash
cd apps/control-panel
VITE_OPEN_BUBBLE_API_BASE_URL=http://localhost:3000 npm run dev -- --host 0.0.0.0
```

## Composio MCP

Set `COMPOSIO_API_KEY` and `COMPOSIO_USER_ID` to let the API create one restricted Composio Tool Router MCP session automatically. `OPEN_BUBBLE_COMPOSIO_USER_ID` is still accepted as a compatibility alias, but `COMPOSIO_USER_ID` is the canonical `.env` key.

If a session is already created elsewhere, set `OPEN_BUBBLE_COMPOSIO_MCP_URL` and either `OPEN_BUBBLE_COMPOSIO_MCP_HEADERS` or `OPEN_BUBBLE_COMPOSIO_MCP_TOKEN`.

Allowed tools are limited to Gmail fetch/draft, Drive fetch, and Calendar fetch/event creation.
