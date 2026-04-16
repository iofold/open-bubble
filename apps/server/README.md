# App Server Placeholder

Server implementation will live here after the team agrees on the API contract.

Before coding, read:

- `docs/specs/server.md`
- `docs/api/openapi.yaml`
- `docs/api/events.md`

Suggested implementation direction for MVP:

- Start with a tiny local server.
- In-memory sessions/events.
- REST endpoints from OpenAPI.
- SSE stream for bubble notifications.
- Contract tests based on `docs/api/examples/`.
