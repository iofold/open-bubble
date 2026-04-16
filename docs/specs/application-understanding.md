# MVP Understanding

The current MVP is a local Fastify API in `apps/api` with two endpoints:

- `GET /health`
- `POST /prompt`

`POST /prompt` accepts one image or video upload plus optional text and returns a synchronous JSON result. Everything beyond that is future scope.
