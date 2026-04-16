# Team Collaboration Plan

## Suggested owners

| Lane | Owner | Primary responsibility | Main paths |
| --- | --- | --- | --- |
| Flutter mobile | AM / Aaditya | Flutter UI and Android shell around the API | `apps/mobile/`, `docs/specs/mobile-flutter.md` |
| API | Teammate 2 | Fastify API MVP and contract updates | `apps/api/`, `docs/api/openapi.yaml`, `docs/api/examples/`, `docs/specs/server.md` |
| Future integration | Teammate 3 | Deferred backend work after the prompt MVP lands | `apps/agent-adapters/`, `docs/specs/agent-adapter.md` |

## Working rules

- Update `docs/api/openapi.yaml` before changing API behavior.
- Keep sample payloads in `docs/api/examples/` aligned with the contract.
- Keep the docs short and remove stale scope as the MVP evolves.
