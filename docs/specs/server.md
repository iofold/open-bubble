# API MVP Spec

The current API contract is intentionally small:

- `GET /health`
- `GET /apps`
- `POST /prompt`
- `GET /tasks/{taskId}`

`GET /apps` returns a static JSON list of supported apps:

- `Codex`
- `Gmail`
- `Gcal`
- `Slack`
- `Notion`

`POST /prompt` uses `multipart/form-data` with:

- required `screenMedia`
- optional `promptText`
- optional raw `promptAudio`
- at least one of `promptText` or `promptAudio`

The frontend does not transcribe audio. It sends the raw bytes and the backend receives them as-is.

`POST /prompt` is asynchronous. It creates a lightweight local task, returns a task id immediately, and the client polls `GET /tasks/{taskId}` for `in_progress`, `completed`, `failed`, or `error`.

The runtime flow is:

- classify the request in `apps/api` with the OpenAI Responses API
- resolve an explicit execution target before launching Codex
- hand the request to the local Codex app-server in that target workspace
- return task status plus the final Codex result

When the task completes, the result includes:

- a request classification: `coding_request`, `personal_context_request`, or `action_request`
- an optional `repoId` on coding classifications when the classifier can confidently map the request to a configured repo
- relevant supported apps when the classifier sees an app-driven context or action
- a routing payload that combines the stored screenshot path, the original prompt fields, the classification, the richer handoff plan, and the resolved execution target
- the handoff plan includes screenshot understanding, inferred intent, expected deliverable, suggested context skills, response style, and a detailed downstream prompt
- for coding requests with no confident repo match, a fallback execution target under repo-root `tmp/`

Keep the source of truth in `docs/api/openapi.yaml`.
