# ADR 0004: Make the API the context graph runtime owner

## Status

Accepted.

## Context

The first graph prototype used Python helper scripts in `apps/codex-agent` for request ingestion, MCP fixture normalization, graph export, and answer generation. That worked for proving the graph shape, but it created two competing runtime paths once the Fastify API added graph endpoints.

The control panel also needed a real frontend app that can be served by the API or run separately during development.

## Decision

Move runtime graph ownership to `apps/api`.

- The API owns DuckDB writes and graph reads.
- The API exposes connector dispatch through `POST /context-graph/connectors`.
- Python helper scripts are removed from the Codex-agent workspace.
- The control panel is a React/Vite app in `apps/control-panel`.
- The API serves the built React app from `/control-panel/`.
- Docker Compose is the canonical full-stack entrypoint.

The action lane is intentionally narrow: Composio MCP credentials should expose only Gmail draft creation and Google Calendar event creation, plus prompt-relevant read tools for Gmail, Drive, and Calendar.

## Consequences

- There is one runtime graph implementation to test and evolve.
- The Codex-agent workspace becomes instructions, schemas, fixtures, and references rather than a second application.
- Docker can run the API, DuckDB, and built control panel consistently.
- Live connector dispatch now depends on `COMPOSIO_API_KEY` plus one configured `COMPOSIO_USER_ID`, or on a pre-created `OPEN_BUBBLE_COMPOSIO_MCP_URL` and its auth headers/token.

Constraint: Do not put Google provider calls in Flutter.
Constraint: Do not store Composio/OAuth credentials in DuckDB, logs, fixtures, or response payloads.
Rejected: Keep Python scripts as runtime fallbacks | preserves duplicated behavior and stale fallback paths.
Rejected: Require a second user confirmation for action tools | user prompts are treated as the action instruction, and the credential/tool scope is limited instead.
Confidence: high
Scope-risk: moderate
Tested: API tests, API typecheck/build, control-panel build.
