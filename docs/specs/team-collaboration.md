# Team Collaboration Plan

## Suggested owners

| Lane | Owner | Primary responsibility | Main paths |
| --- | --- | --- | --- |
| Flutter mobile | AM / Aaditya | Flutter UI and Android shell around the API | `apps/mobile/`, `docs/specs/mobile-flutter.md` |
| API | Teammate 2 / Neil | Fastify API MVP and contract updates | `apps/api/`, `docs/api/openapi.yaml`, `docs/api/examples/`, `docs/specs/server.md` |
| Codex context graph + connectors | Backend / agent lane | DuckDB context graph, MCP connector normalization, graph fixtures/tests | `apps/codex-agent/`, `docs/specs/mcp-connectors.md` |
| Graph control panel | Backend / frontend support | Local graph explorer, inspector, provenance/answer trace views | `apps/codex-agent/control-panel/`, `docs/specs/graph-control-panel.md` |

## Working rules

- Update `docs/api/openapi.yaml` before changing API behavior.
- Keep sample payloads in `docs/api/examples/` aligned with the contract.
- Keep `apps/api` ownership separate from `apps/codex-agent` experiments unless the API contract explicitly wires them together.
- Keep the docs short and remove stale scope as the MVP evolves.
