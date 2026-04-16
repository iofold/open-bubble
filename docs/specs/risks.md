# Risks and Scope Cuts

| Risk | Impact | Mitigation / scope cut |
| --- | --- | --- |
| Media and prompt validation is confusing | API/mobile integration slows down | Keep `POST /prompt` shape simple: required `screenMedia`, plus `promptText` or raw `promptAudio` |
| Contract drift causes confusion | Teammates implement incompatible flows | Update `docs/api/openapi.yaml` before API behavior changes |
| API scope grows too quickly | MVP slips | Keep `apps/api` limited to `GET /health` and `POST /prompt` until the contract changes |
| Android overlay permission UX takes too long | Bubble demo blocked | Fall back to in-app UI while API/media flow is proven |
| Gmail/Drive/Calendar connector data leaks too much private context | Trust and demo safety risk | Query MCP connectors only when prompt-relevant; ingest minimized snippets with provenance; keep tokens/secrets out of DuckDB/logs |
| Graph control panel becomes too large for MVP | Backend/frontend scope creep | Start with read-only static graph explorer, filters, inspector, and answer trace; defer editing, auth, and production dashboards |
