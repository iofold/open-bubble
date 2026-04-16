# MVP Understanding

The current MVP is a local Fastify API in `apps/api` with two endpoints:

- `GET /health`
- `POST /prompt`

`POST /prompt` accepts one `screenMedia` upload plus at least one of `promptText` or raw `promptAudio`, then returns a synchronous JSON result. The client does not transcribe audio; it forwards the bytes as-is.
