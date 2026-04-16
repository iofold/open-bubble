# MVP Understanding

The current MVP is a local Fastify API in `apps/api` with three endpoints:

- `GET /health`
- `POST /prompt`
- `GET /tasks/{taskId}`

`POST /prompt` accepts one `screenMedia` upload plus at least one of `promptText` or raw `promptAudio`, then returns a task handle immediately. The client does not transcribe audio; it forwards the bytes as-is and polls `GET /tasks/{taskId}` for `in_progress`, `completed`, `failed`, or `error`.
