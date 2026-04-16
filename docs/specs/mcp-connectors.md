# MCP Connector Context Spec

## Role

Open Bubble can enrich local session answers with user-approved context from Gmail, Google Drive, and Google Calendar through MCP connectors available to the local Codex/App Server session.

The phone frontend should not connect to Google services directly. The App Server/Codex local session owns connector access, consent state, retrieval, normalization, and graph ingestion.

## MVP Boundary

For the first implementation, connectors are optional context sources for the spawned Codex agent:

```text
Flutter mobile
  -> App Server context request
    -> Codex agent cwd: apps/codex-agent/
      -> built-in/local MCP connectors
        -> Gmail / Drive / Calendar reads
      -> DuckDB context graph ingestion
      -> ContextAnswer back to App Server
```

MCP connector data should be fetched only when the user prompt or session policy makes it relevant. Do not query Gmail, Drive, or Calendar for every request.

## Connector Capabilities

### Gmail

Allowed MVP reads:

- Search messages by query terms.
- Fetch selected message/thread metadata and text snippets.
- Summarize recent messages only when the prompt asks about email or people mentioned in email.

Graph entities:

- `gmail_thread`
- `gmail_message`
- `person`
- `organization`
- `attachment`

Useful relations:

- `sent_by`
- `sent_to`
- `part_of_thread`
- `mentions`
- `has_attachment`
- `derived_from_mcp`

### Google Drive

Allowed MVP reads:

- Search files by title/content terms.
- Fetch selected document metadata and text extract when available.
- Ingest only the snippets needed to answer the current request.

Graph entities:

- `drive_file`
- `drive_folder`
- `document_section`
- `person`
- `organization`

Useful relations:

- `owned_by`
- `shared_with`
- `contained_in`
- `mentions`
- `derived_from_mcp`

### Google Calendar

Allowed MVP reads:

- Search upcoming and recent events by date range.
- Fetch event title, time, attendees, location/meeting link metadata, and description snippets.
- Answer schedule/context questions only when the prompt asks about calendar, meetings, availability, or a person/event.

Graph entities:

- `calendar_event`
- `person`
- `organization`
- `location`

Useful relations:

- `attended_by`
- `scheduled_with`
- `scheduled_at`
- `mentions`
- `derived_from_mcp`

## Trigger Policy

The agent may query a connector when the prompt includes one of these signals:

| Connector | Prompt signals |
| --- | --- |
| Gmail | email, inbox, thread, message, sender, reply, attachment, "what did they say" |
| Drive | doc, file, Drive, document, spreadsheet, deck, notes, "find the file" |
| Calendar | calendar, meeting, event, schedule, availability, tomorrow, today, next call |

The agent should not silently broaden connector access. If a request is ambiguous, answer from local context and include a short note that connector context was not queried.

## Ingestion Contract

Each connector fetch should create one raw episode:

| Field | Value |
| --- | --- |
| `graph_episodes.type` | `mcp_gmail_search`, `mcp_drive_search`, `mcp_calendar_search`, or a narrower fetch type |
| `graph_episodes.source` | MCP connector name and operation |
| `graph_episodes.content` | Redacted/minimized text used for the answer |
| `graph_episodes.metadata` | Query, result ids, timestamps, connector, scope, redaction notes |

Derived entities and relations must point back to the source episode with `graph_relations.source_episode_id`.

The Codex-agent implementation accepts normalized connector result JSON matching `apps/codex-agent/schemas/mcp-fetch-result.schema.json` and ingests it with:

```bash
apps/codex-agent/scripts/ingest-mcp-results.py \
  --db <context.duckdb> \
  --input <mcp-fetch-result.json>
```

This keeps live MCP tool calls separate from graph normalization. `apps/api` or the spawned Codex session can own connector dispatch and write the normalized JSON handoff file.

## Privacy And Safety

- Treat connector data as local private context.
- Store the smallest useful snippet, not whole mailboxes or full Drive folders.
- Prefer metadata and excerpts over complete documents/messages unless the user explicitly asks for the full item.
- Never expose connector data to mobile unless it is part of the specific answer or graph view the user requested.
- Do not write connector OAuth tokens or secrets into DuckDB, logs, fixtures, or response payloads.
- Mark connector-derived graph records with metadata:

```json
{
  "connector": "gmail",
  "mcpTool": "search",
  "redaction": "snippet_only",
  "userVisible": true
}
```

## Answer Behavior

When connector data is used, `ContextAnswer.localContextUsed` should include entries such as:

- `mcp:gmail`
- `mcp:drive`
- `mcp:calendar`
- `duckdb:graph_entities`
- `duckdb:graph_relations`

The answer details should cite connector-derived snippets by source label, not by raw private ids unless the frontend needs an internal deep link.

## Open Decisions

- Exact MCP tool names exposed by the local Codex App session.
- Whether connector consent is configured outside Open Bubble or surfaced in the control panel.
- How long connector-derived snippets should live in the local DuckDB graph.
- Whether the control panel can purge connector-derived data by connector, time range, or session.
