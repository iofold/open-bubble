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

Keep the source of truth in `docs/api/openapi.yaml`.
