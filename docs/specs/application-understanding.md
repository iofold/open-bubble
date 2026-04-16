# MVP Understanding

The current MVP is a three-layer local flow:

- `apps/api` exposes `GET /health` and `POST /prompt`
- `apps/codex-app-server` bridges the API to the local `codex app-server`
- `apps/codex-agent` remains available for local Codex-related assets and future support flows

`POST /prompt` accepts one screenshot-style `screenMedia` upload plus required `promptText`, infers the target repo from backend config, starts a local Codex App Server turn in that repo, waits for completion, and returns a synchronous JSON result that includes the PR URL.
