# Team Collaboration Plan

## Suggested owners

| Lane | Owner | Primary responsibility | Main paths |
| --- | --- | --- | --- |
| Flutter mobile | AM / Aaditya | Flutter UI and Android shell around the API | `apps/mobile/`, `docs/specs/mobile-flutter.md` |
| API | Teammate 2 / Neil | Fastify API MVP and contract updates | `apps/api/`, `docs/api/openapi.yaml`, `docs/api/examples/`, `docs/specs/server.md` |
| Context graph + connectors | Backend / agent lane | API-owned DuckDB context graph, Composio MCP dispatch, graph fixtures/tests | `apps/api/`, `apps/codex-agent/`, `docs/specs/mcp-connectors.md` |
| Graph control panel | Backend / frontend support | React graph explorer, inspector, provenance/answer trace views | `apps/control-panel/`, `docs/specs/graph-control-panel.md` |

## Working rules

- Update `docs/api/openapi.yaml` before changing API behavior.
- Keep sample payloads in `docs/api/examples/` aligned with the contract.
- Keep graph runtime code in `apps/api`; keep `apps/codex-agent` to agent instructions, references, schemas, and fixtures.
- Keep the docs short and remove stale scope as the MVP evolves.
