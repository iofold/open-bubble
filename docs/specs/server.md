# API MVP Spec

## Role

The API is the contract boundary for the Flutter app MVP. It stays intentionally small so the team can move quickly without carrying session or event machinery as active behavior before the current flow is stable.

## Responsibilities

- Provide `GET /health` for local server checks.
- Accept multipart prompt submissions at `POST /prompt`.
- Require one `screenMedia` file and at least one prompt field.
- Accept `image/*` and `video/*` for screen media.
- Accept raw `audio/*` in `promptAudio` without client-side transcription.
- Return a synchronous JSON answer that the mobile app can render immediately.

## Transport

- Use REST only for the active MVP.
- Keep request handling synchronous.
- Keep the active API surface limited to the documented endpoints until the contract changes.

## Storage

Start with in-memory request handling. Add persistence only if a later demo needs it.

## Suggested server modules later

```text
apps/api/
  src/
    server.ts
    app.ts
    routes/
    lib/
  test/
```

## Codex agent cwd

When the server later needs a real Codex-backed answer, spawn or manage Codex with `apps/codex-agent/` as the working directory. Pass the request through environment or file handoff only after the active `/prompt` MVP contract grows beyond the current synchronous path.

## Future scope note

The repository now also contains future-scope material for Codex agent integration, direct DuckDB context lookups, and async answer delivery. Treat those as next-step references, not active API behavior, until `docs/api/openapi.yaml` is expanded again.

## Contract discipline

- `docs/api/openapi.yaml` is the source of truth for the API MVP.
- Server implementation should include contract tests before mobile depends on changed behavior.
