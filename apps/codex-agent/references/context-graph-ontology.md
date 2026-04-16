# Open Bubble Context Graph Ontology

This ontology is inspired by temporal context graph systems, but it does not depend on Graphiti or any external graph runtime.

## Design Goals

- Preserve raw frontend inputs as immutable-ish episodes.
- Derive searchable semantic entities from each episode.
- Store fact edges with provenance, confidence, and validity windows.
- Keep the MVP implementation usable through the local Fastify API with DuckDB as the backing store.

## Core Layers

### Episodes

Episodes are raw source events. They are the provenance root for derived entities and facts.

Table: `graph_episodes`

Required episode types:

| Type | Meaning |
| --- | --- |
| `frontend_context_request` | Screenshot plus voice/typed prompt sent by the phone frontend |
| `seed_context` | Deterministic test/demo context injected by local scripts |
| `agent_observation` | Future agent-authored observation about current work |

### Entities

Entities are semantic nodes. They may be re-used across episodes.

Table: `graph_entities`

Required entity types:

| Type | Meaning |
| --- | --- |
| `agent_session` | Open Bubble backend/Codex session |
| `frontend_device` | Phone/device that submitted a request |
| `context_request` | Individual frontend request |
| `screenshot_observation` | Analysis of screenshot image or metadata |
| `voice_note` | Transcript and metadata from audio/typed prompt |
| `screen_app` | App/package visible in screenshot metadata |
| `user_intent` | Classified prompt intent: `fetch_response`, `ingest_only`, `code_assertion` |
| `task` | Work item or current agent task |
| `file` | Local file path relevant to current context |
| `claim` | User-visible claim or assertion to verify |
| `answer` | Future persisted response sent to frontend |
| `gmail_thread` | Gmail thread fetched through local MCP |
| `gmail_message` | Gmail message fetched through local MCP |
| `drive_file` | Google Drive file fetched through local MCP |
| `drive_folder` | Google Drive folder fetched through local MCP |
| `document_section` | Extracted section/snippet from a Drive document |
| `calendar_event` | Google Calendar event fetched through local MCP |
| `person` | Human participant, sender, attendee, or document owner |
| `organization` | Organization mentioned in connector or local context |
| `attachment` | Email or Drive attachment metadata |

### Facts

Facts are directed edges between entities or from an episode to an entity.

Table: `graph_relations`

Every fact should include:

- `type`: machine relation type.
- `fact`: human-readable fact phrase.
- `confidence`: `0.0` to `1.0`.
- `source_episode_id`: provenance pointer.
- `valid_at`: when the fact became valid.
- `invalid_at`: when superseded, if known.

Required relation types:

| Type | Meaning |
| --- | --- |
| `episode_mentions` | Episode produced or mentioned an entity |
| `in_session` | Request/task/file belongs to a session |
| `from_device` | Request came from a frontend device |
| `expresses_intent` | Request expresses a classified user intent |
| `has_screenshot` | Request includes screenshot observation |
| `has_voice_note` | Request includes voice note |
| `observed_app` | Screenshot observed a screen app |
| `current_task` | Session currently works on a task |
| `touches_file` | Task or request relates to a file |
| `supports_claim` | Evidence supports a claim |
| `contradicts_claim` | Evidence contradicts a claim |
| `derived_from_mcp` | Entity or fact came from an MCP connector episode |
| `sent_by` | Gmail message was sent by a person |
| `sent_to` | Gmail message was sent to a person |
| `part_of_thread` | Gmail message belongs to a thread |
| `has_attachment` | Message or Drive item has an attachment |
| `owned_by` | Drive file/folder is owned by a person |
| `shared_with` | Drive file/folder is shared with a person |
| `contained_in` | Drive file belongs to a folder |
| `attended_by` | Calendar event includes an attendee |
| `scheduled_with` | Calendar event is scheduled with a person |
| `scheduled_at` | Calendar event has a time anchor |
| `mentions` | Source item mentions an entity |

## Retrieval Rules

1. Start from `session_context` for current state.
2. Search `context_chunks` for low-latency text matches.
3. Use `graph_relations.source_episode_id` to cite provenance.
4. Exclude chunks from the current request when answering from prior context.
5. Use current screenshot/voice analysis as present evidence, not prior evidence.

## Migration Rule

Keep this ontology small. Add new entity/relation types only when a test fixture or real frontend request needs them.
