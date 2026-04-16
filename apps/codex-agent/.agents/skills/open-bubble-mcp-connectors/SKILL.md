---
name: open-bubble-mcp-connectors
description: Fetch Gmail, Google Drive, and Google Calendar context or execute allowed Gmail/Calendar actions through the API Composio MCP dispatch endpoint.
---

# Open Bubble MCP Connectors

## Use This When

The user prompt asks about email, Drive documents/files, calendar meetings, schedules, attendees, drafting an email, or creating a calendar event.

Do not query connectors for unrelated prompts.

## Workflow

1. Decide which connector is relevant from the prompt:
   - Gmail: email, inbox, thread, message, reply, sender, attachment, draft.
   - Drive: file, doc, document, spreadsheet, deck, notes.
   - Calendar: calendar, meeting, schedule, availability, event, attendee.
2. Call `POST /context-graph/connectors`.
3. For reads, the API normalizes snippets into graph episodes/entities/facts/chunks.
4. For actions, the API executes only:
   - `GMAIL_CREATE_EMAIL_DRAFT`
   - `GOOGLECALENDAR_CREATE_EVENT`
5. Continue answer generation from the API graph snapshot.

## Output Rules

- Mark connector context in `ContextAnswer.localContextUsed`, for example `mcp:gmail`.
- Store snippets with metadata: `connector`, `mcpTool`, `redaction`, `userVisible`, and `sourceEpisodeId`.
- Do not store OAuth tokens, secrets, or whole mailboxes/folders.
