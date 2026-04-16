---
name: open-bubble-mcp-connectors
description: Fetch or ingest Gmail, Google Drive, and Google Calendar context through local Codex/App Server MCP connectors, normalize results into the DuckDB context graph, and make them available for frontend ContextAnswer responses.
---

# Open Bubble MCP Connectors

## Use This When

The user prompt asks about email, Drive documents/files, calendar meetings, schedules, attendees, or related personal context.

Do not query connectors for unrelated prompts.

## Workflow

1. Decide which connector is relevant from the prompt:
   - Gmail: email, inbox, thread, message, reply, sender, attachment.
   - Drive: file, doc, document, spreadsheet, deck, notes.
   - Calendar: calendar, meeting, schedule, availability, event, attendee.
2. Use the local Codex/App Server MCP connector if available.
3. Minimize results to snippets and metadata needed for the answer.
4. Normalize the result JSON to `schemas/mcp-fetch-result.schema.json`.
5. Ingest normalized results:

```bash
./scripts/ingest-mcp-results.py --db "$OPEN_BUBBLE_CONTEXT_DB" --input /path/to/mcp-result.json
```

6. Re-run or continue answer generation from the context graph.

## Fixture Path

For tests or demo data, use:

- `testdata/mcp-gmail-results.json`
- `testdata/mcp-drive-results.json`
- `testdata/mcp-calendar-results.json`

## Output Rules

- Mark connector context in `ContextAnswer.localContextUsed`, for example `mcp:gmail`.
- Store snippets as `context_chunks` with metadata: `connector`, `mcpTool`, `redaction`, `userVisible`, and `sourceEpisodeId`.
- Do not store OAuth tokens, secrets, or whole mailboxes/folders.
