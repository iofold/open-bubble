# ADR 0003: Keep Google connector access local and inspectable

## Status

Accepted for planning.

## Context

Open Bubble will need Gmail, Google Drive, and Google Calendar context for richer phone-side questions. The local Codex/App Server session may have built-in MCP connectors available, but the mobile app should stay a small companion surface and should not own Google connector integrations directly.

The context graph also needs an operator-facing UI so the team can inspect what was ingested, which facts came from connectors, and why an answer was produced.

## Decision

Route Gmail, Drive, and Calendar access through local MCP connectors available to the Codex/App Server session. Normalize connector results into the local DuckDB context graph as episodes, entities, facts, and chunks.

Plan a local control panel for graph exploration and debugging. It should show sessions, entities, facts, episodes, connector filters, and answer traces. The Android app remains focused on capture, ask, and notification flows.

## Consequences

- Mobile avoids direct Google API auth, scopes, and connector logic.
- Connector-derived data stays local to the developer machine/session.
- The same graph ingestion path can handle frontend requests, local repo context, and Google connector context.
- The control panel can debug privacy/provenance issues before connector data reaches the phone UI.
- The first implementation still needs concrete MCP tool names and consent/session setup once live connector calls begin.

Constraint: Hackathon MVP should avoid production connector infrastructure.
Constraint: Connector data may contain private user information and must be minimized before storage/display.
Rejected: Put Gmail/Drive/Calendar integrations in Flutter | expands mobile auth/security scope and couples the phone app to provider APIs.
Rejected: Add a production graph UI now | specs and graph export/API should stabilize first.
Confidence: medium
Scope-risk: moderate
Directive: Do not query Google connectors by default; require prompt relevance or explicit user intent.
Tested: Documentation-only decision.
Not-tested: Live MCP connector availability, OAuth consent, and graph control panel runtime.
