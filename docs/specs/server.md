# API MVP Spec

The current API contract is intentionally small:

- `GET /health`
- `POST /prompt`

`POST /prompt` uses `multipart/form-data` with:

- required `screenMedia`
- optional `promptText`
- optional raw `promptAudio`
- at least one of `promptText` or `promptAudio`

The frontend does not transcribe audio. It sends the raw bytes and the backend receives them as-is.

Keep the API synchronous and keep the source of truth in `docs/api/openapi.yaml`.
