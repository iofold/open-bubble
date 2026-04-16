# Product Scope

The MVP proves that a small local API can accept screen media plus at least one prompt field, either text or raw audio, and return a synchronous JSON answer.

## Goals

- Keep the active API surface limited to `GET /health` and `POST /prompt`.
- Make the request shape easy to understand and easy to validate.
- Keep the docs small enough that another teammate can follow them quickly.
- Keep richer Codex-agent context graph work decoupled from API dispatch until the API contract changes.

## Adjacent Codex-Agent Goals

- Ingest screenshot + prompt requests into a local DuckDB context graph.
- Normalize Gmail, Drive, and Calendar MCP connector results into the graph when prompt-relevant.
- Export graph JSON for a local control panel.
- Keep connector-derived context inspectable and provenance-linked.

## Non-goals

- Broad orchestration in the active API MVP.
- Long-lived background channels in the active API MVP.
- Persistence or auth for the first API cut.
- Mobile-owned Gmail, Drive, or Calendar integrations.
- Automatic code assertion when the user did not explicitly request it.
- Production graph dashboards.

## Success Criteria

- A teammate can run the local API and mobile flow from a fresh checkout.
- `POST /prompt` remains aligned with `docs/api/openapi.yaml`.
- Connector-derived context, when used, is local, minimized, and inspectable through the graph export/control panel.
