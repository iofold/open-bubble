# Product Scope

The MVP proves two things at the same time:

1. A small local API can accept `screenMedia` plus at least one prompt field, create a lightweight task immediately, and expose a polling path for the eventual result.
2. The Android client can capture the current screen through an accessibility runtime, collect an explicit user prompt from the bubble, submit both to the API, and return the answer through clipboard, notification, and review UI.

## Goals

- Keep the active API surface limited to `GET /health`, `GET /apps`, `POST /prompt`, and `GET /tasks/{taskId}`.
- Make the request shape easy to understand and easy to validate.
- Keep the async task flow lightweight enough to run locally on one Mac without extra infrastructure.
- Keep the Android bubble flow explicit and user-driven.
- Keep richer Codex-agent context graph work decoupled from API dispatch until the API contract changes.

## Adjacent Codex-Agent Goals

- Ingest screenshot + prompt requests into a local DuckDB context graph.
- Normalize Gmail, Drive, and Calendar MCP connector results into the graph when prompt-relevant.
- Export graph JSON for a local control panel.
- Keep connector-derived context inspectable and provenance-linked.

## Non-goals

- Broad orchestration in the active API MVP.
- Long-lived background channels in the active API MVP.
- Auth for the first API cut.
- Mobile-owned Gmail, Drive, or Calendar integrations.
- Automatic code assertion when the user did not explicitly request it.
- Production graph dashboards.
- App-store-ready compliance or policy work.
- Full auth, multi-tenant accounts, or production-grade secret handling.
- Durable cloud persistence.
- Perfect cross-platform Flutter support. Android is the priority.
- Silent autonomous actions inside third-party apps without explicit user review.

## Success criteria

- A teammate can run the local API and the Android client from a fresh checkout.
- `POST /prompt` and `GET /tasks/{taskId}` remain aligned with `docs/api/openapi.yaml`.
- The bubble can submit `screenMedia` plus `promptText`, poll the task, and return the answer through notification, clipboard, and review.
- Connector-derived context, when used later, is local, minimized, and inspectable through the graph export/control panel.
