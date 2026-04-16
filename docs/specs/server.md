# API MVP Spec

## Role

The API is the contract boundary for the Flutter app MVP. It stays intentionally small so the team can move quickly without carrying session or event machinery that the current demo does not need.

## Responsibilities

- Provide `GET /health` for local server checks.
- Accept multipart prompt submissions at `POST /prompt`.
- Require one uploaded media file and allow an optional text prompt.
- Accept `image/*` and `video/*` uploads.
- Return a synchronous JSON answer that the mobile app can render immediately.

## Transport

- Use REST only for the MVP.
- Keep request handling synchronous.
- Keep the API surface limited to the documented endpoints until the contract changes.

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

## Contract discipline

- `docs/api/openapi.yaml` is the source of truth for the API MVP.
- Server implementation should include contract tests before mobile depends on changed behavior.
