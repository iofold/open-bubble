# Context Graph Control Panel Spec

## Role

The control panel is a local web UI for inspecting and debugging the Open Bubble context graph. It is for developers and demo operators, not the Android bubble MVP surface.

It should make it easy to see what the agent knows, where facts came from, which connector produced them, and why a frontend answer was generated.

## Odin-Inspired Patterns To Keep

Borrow these patterns from `../milestone-odin`:

- Full-screen graph canvas with pan/zoom.
- Node type and edge type filters.
- Search box that focuses matching nodes.
- Side inspector for selected node details.
- Incoming/outgoing relation lists.
- Provenance/reasoning trace that follows fact edges back to source episodes.
- Graph stats: node count, edge count, type counts, and health warnings.
- Community/cluster summary when graph size grows.

Do not copy Odin's hospitality-specific taxonomy, visual palette, or production graph complexity. Open Bubble needs a smaller local-session graph explorer.

## First Screen

The first screen should be the working graph explorer, not a landing page.

Suggested layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Top bar: session selector | search | connector filters      │
├───────────────┬───────────────────────────────┬────────────┤
│ Left filters  │ Graph canvas                  │ Inspector  │
│ - node types  │ - pan/zoom                    │ - selected │
│ - edge types  │ - focused node                │ - facts    │
│ - connectors  │ - highlighted provenance path │ - episodes │
│ - time range  │                               │ - actions  │
├───────────────┴───────────────────────────────┴────────────┤
│ Bottom strip: graph health, recent episodes, latest answer  │
└────────────────────────────────────────────────────────────┘
```

## Core Views

### Graph Explorer

Purpose: browse entities/facts visually.

Controls:

- Session selector.
- Search by entity name, type, source, or fact text.
- Node type filter.
- Edge type filter.
- Connector filter: local, frontend, Gmail, Drive, Calendar.
- Time filter: now, today, last 7 days, all.
- Focus modes:
  - selected node neighborhood,
  - latest context request,
  - latest answer,
  - connector-only subgraph.

### Node Inspector

Shows:

- Entity type, name, description.
- Metadata table.
- Incoming facts.
- Outgoing facts.
- Source episodes for each fact.
- Related chunks used for retrieval.

Actions:

- Focus neighborhood.
- Copy entity id.
- Hide type.
- Open source item when an MCP connector supports a safe local deep link.

### Episode Inspector

Shows:

- Raw episode type/source.
- Ingested timestamp and original created timestamp.
- Redacted/minimized content.
- Derived entities.
- Derived facts.
- Connector metadata, if any.

### Answer Trace

Shows how a `ContextAnswer` was produced:

- Incoming request.
- Intent classification.
- Retrieval mode.
- Context chunks used.
- Connector fetches used.
- Final answer.

This can start as a side panel populated from DuckDB rows rather than a separate trace store.

## Draft API Shape

These endpoints are draft control-panel APIs. Add them to `docs/api/openapi.yaml` when implementation begins.

```text
GET /v1/context-graph/sessions/{sessionId}
GET /v1/context-graph/sessions/{sessionId}/entities
GET /v1/context-graph/sessions/{sessionId}/entities/{entityId}
GET /v1/context-graph/sessions/{sessionId}/episodes
GET /v1/context-graph/sessions/{sessionId}/episodes/{episodeId}
GET /v1/context-graph/sessions/{sessionId}/search?q=...
GET /v1/context-graph/sessions/{sessionId}/health
POST /v1/context-graph/sessions/{sessionId}/purge
```

Initial response shape for graph view:

```json
{
  "sessionId": "sess_test_001",
  "nodes": [
    {
      "id": "task_context_graph_ingest",
      "type": "task",
      "label": "Context graph ingestion",
      "description": "Implement context graph ingestion",
      "metadata": {}
    }
  ],
  "edges": [
    {
      "id": "rel_seed_session_task",
      "source": "session:sess_test_001",
      "target": "task_context_graph_ingest",
      "type": "current_task",
      "label": "Session is working on context graph ingestion",
      "confidence": 0.95,
      "sourceEpisodeId": "episode_seed_status"
    }
  ],
  "stats": {
    "nodeCount": 1,
    "edgeCount": 1,
    "episodeCount": 1
  }
}
```

## Visual System

Keep the UI dense and operational:

- Neutral app shell with strong contrast.
- Type colors should distinguish categories, not decorate the page.
- Use icons for search, filter, reset camera, focus, copy, and purge.
- Use a side panel for details rather than modal-first exploration.
- Avoid nested cards; use full-height panels and tables/lists.

Suggested node groups:

| Group | Types | Visual treatment |
| --- | --- | --- |
| Session | `agent_session`, `context_request`, `answer` | Larger nodes |
| Frontend | `frontend_device`, `screenshot_observation`, `voice_note`, `screen_app` | Cool colors |
| Work context | `task`, `file`, `claim` | Neutral/blue |
| MCP Gmail | `gmail_thread`, `gmail_message` | Red accent |
| MCP Drive | `drive_file`, `drive_folder`, `document_section` | Green accent |
| MCP Calendar | `calendar_event` | Purple accent |
| People/orgs | `person`, `organization` | Gold/teal |

## Implementation Recommendation

Start with a simple local web page under `apps/server` or a future `apps/control-panel`.

The control panel is now a React/Vite app under `apps/control-panel`. The main Fastify API serves the built app from `/control-panel/` and streams graph snapshots from `/context-graph/stream`.

```bash
cd apps/api
HOST=<tailscale-ip> PORT=3000 OPEN_BUBBLE_CONTEXT_DB=../codex-agent/data/demo-context.duckdb npm run dev
```

Then open:

```text
http://<tailscale-ip>:3000/control-panel?sessionId=sess_test_001
```

For separate control-panel development:

```bash
cd apps/control-panel
VITE_OPEN_BUBBLE_API_BASE_URL=http://<tailscale-ip>:3000 npm run dev -- --host 0.0.0.0
```

This is a local operator/debugging panel served by `apps/api`. It keeps the graph contract testable while the API owns dispatch and coordination.

## Demo Scenario

1. Seed local graph context.
2. Send a phone context request.
3. Agent ingests screenshot + voice note.
4. Control panel graph updates with new episode, request, screenshot, voice note, and intent nodes.
5. User clicks the generated answer and sees the trace back to seed context and source request.
6. Later, a Gmail/Drive/Calendar query adds connector-derived episodes and facts that can be filtered by connector.
