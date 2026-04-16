# API MVP Spec

The current API contract is intentionally small:

- `GET /health`
- `POST /prompt`

`POST /prompt` uses `multipart/form-data` with:

- required `screenMedia`
- required `promptText`

The active MVP flow is:

1. The frontend uploads one screenshot plus a text request to `apps/api`.
2. `apps/api` passes the request to `apps/codex-app-server`.
3. `apps/codex-app-server` infers the target repo from local config, starts or connects to a local `codex app-server` process, creates a thread in the inferred repo, submits the screenshot plus text prompt, and waits for the turn to complete.
4. The API returns a synchronous JSON response with the Codex summary plus PR metadata.

For the current demo path:

- screenshot input is image-only
- repo inference is local-config-driven and may use prompt alias matching
- the backend waits on App Server completion events instead of building a separate polling layer
- generated Codex App Server type bindings live under `apps/codex-app-server/generated/` and must be regenerated, not edited manually

Keep the API synchronous and keep the source of truth in `docs/api/openapi.yaml`.
