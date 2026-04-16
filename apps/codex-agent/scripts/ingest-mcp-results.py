#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any
import urllib.error
import urllib.request

from processor_loader import load_processor


SCRIPT_DIR = Path(__file__).resolve().parent
CONNECTORS = {"gmail", "drive", "calendar"}


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SystemExit(f"{label} must be a JSON object")
    return value


def require_list(value: Any, label: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"{label} must be an array")
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise SystemExit(f"{label}[{index}] must be an object")
    return value


def person_id(processor: Any, person: dict[str, Any]) -> str:
    email = str(person.get("email") or "").strip().lower()
    name = str(person.get("name") or email or "unknown").strip()
    return processor.stable_id("person", email or name)


def person_name(person: dict[str, Any]) -> str:
    email = str(person.get("email") or "").strip()
    name = str(person.get("name") or "").strip()
    return name or email or "Unknown person"


def add_person(processor: Any, conn: Any, session_id: str, person: dict[str, Any], timestamp: str) -> str:
    entity_id = person_id(processor, person)
    processor.upsert_entity(
        conn,
        entity_id,
        session_id,
        "person",
        person_name(person),
        str(person.get("email") or ""),
        {"email": person.get("email"), "name": person.get("name")},
        timestamp,
    )
    return entity_id


def episode_payload(fetch: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in require_list(fetch.get("results"), "results"):
        for key in ["subject", "name", "title", "snippet", "description"]:
            value = item.get(key)
            if value:
                parts.append(str(value))
    return "\n".join(parts)


def upsert_episode(processor: Any, conn: Any, fetch: dict[str, Any], timestamp: str) -> str:
    connector = str(fetch["connector"])
    operation = str(fetch.get("operation") or "fetch")
    session_id = str(fetch["sessionId"])
    episode_id = str(
        fetch.get("episodeId")
        or processor.stable_id(
            "episode",
            connector,
            operation,
            session_id,
            fetch.get("query"),
            fetch.get("fetchedAt"),
        )
    )
    metadata = {
        "connector": connector,
        "operation": operation,
        "query": fetch.get("query"),
        "sourceRequestId": fetch.get("sourceRequestId"),
        "redaction": "snippet_only",
        "userVisible": True,
    }
    if isinstance(fetch.get("metadata"), dict):
        metadata.update(fetch["metadata"])
    processor.upsert_episode(
        conn,
        episode_id,
        session_id,
        f"mcp_{connector}_{operation}",
        f"mcp:{connector}:{operation}",
        episode_payload(fetch),
        metadata,
        str(fetch.get("fetchedAt") or timestamp),
        timestamp,
    )
    return episode_id


def relation(
    processor: Any,
    conn: Any,
    source_id: str,
    target_id: str,
    rel_type: str,
    fact: str,
    session_id: str,
    episode_id: str,
    timestamp: str,
    metadata: dict[str, Any] | None = None,
    confidence: float = 0.85,
) -> int:
    del session_id
    processor.upsert_relation(
        conn,
        processor.stable_id("rel", source_id, target_id, rel_type, episode_id),
        source_id,
        target_id,
        rel_type,
        metadata or {},
        timestamp,
        fact=fact,
        confidence=confidence,
        source_episode_id=episode_id,
    )
    return 1


def episode_mentions(
    processor: Any,
    conn: Any,
    episode_id: str,
    entity_id: str,
    timestamp: str,
    request_id: str | None,
) -> int:
    processor.upsert_relation(
        conn,
        processor.stable_id("rel", episode_id, entity_id, "episode_mentions"),
        episode_id,
        entity_id,
        "episode_mentions",
        {"sourceRequestId": request_id},
        timestamp,
        fact="MCP episode mentions entity",
        source_episode_id=episode_id,
    )
    processor.upsert_relation(
        conn,
        processor.stable_id("rel", episode_id, entity_id, "derived_from_mcp"),
        episode_id,
        entity_id,
        "derived_from_mcp",
        {"sourceRequestId": request_id},
        timestamp,
        fact="Entity was derived from MCP connector data",
        source_episode_id=episode_id,
    )
    return 2


def add_chunk(
    processor: Any,
    conn: Any,
    session_id: str,
    source: str,
    text: str,
    metadata: dict[str, Any],
    timestamp: str,
) -> int:
    if not text.strip():
        return 0
    processor.upsert_chunk(
        conn,
        processor.stable_id("chunk", session_id, source, text[:80]),
        session_id,
        source,
        text.strip(),
        {
            "mcpTool": "search",
            "redaction": "snippet_only",
            "userVisible": True,
            **metadata,
        },
        timestamp,
    )
    return 1


def ingest_gmail(processor: Any, conn: Any, fetch: dict[str, Any], episode_id: str, timestamp: str) -> dict[str, int]:
    session_id = str(fetch["sessionId"])
    request_id = fetch.get("sourceRequestId")
    counts = {"entities": 0, "relations": 0, "chunks": 0}
    for item in require_list(fetch.get("results"), "results"):
        message_id = f"gmail_message:{item.get('id')}"
        thread_id = f"gmail_thread:{item.get('threadId') or item.get('id')}"
        subject = str(item.get("subject") or "Gmail message")
        snippet = str(item.get("snippet") or "")
        processor.upsert_entity(conn, thread_id, session_id, "gmail_thread", subject, subject, {"connector": "gmail", "threadId": item.get("threadId")}, timestamp)
        processor.upsert_entity(conn, message_id, session_id, "gmail_message", subject, snippet, {"connector": "gmail", "messageId": item.get("id"), "date": item.get("date")}, timestamp)
        counts["entities"] += 2
        counts["relations"] += episode_mentions(processor, conn, episode_id, thread_id, timestamp, request_id)
        counts["relations"] += episode_mentions(processor, conn, episode_id, message_id, timestamp, request_id)
        counts["relations"] += relation(processor, conn, message_id, thread_id, "part_of_thread", "Gmail message belongs to thread", session_id, episode_id, timestamp)
        sender = item.get("from")
        if isinstance(sender, dict):
            sender_id = add_person(processor, conn, session_id, sender, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, sender_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, message_id, sender_id, "sent_by", "Gmail message was sent by person", session_id, episode_id, timestamp)
        for recipient in require_list(item.get("to"), "to"):
            recipient_id = add_person(processor, conn, session_id, recipient, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, recipient_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, message_id, recipient_id, "sent_to", "Gmail message was sent to person", session_id, episode_id, timestamp)
        for attachment in require_list(item.get("attachments"), "attachments"):
            attachment_id = f"attachment:{attachment.get('id') or processor.stable_id('att', attachment.get('name'))}"
            name = str(attachment.get("name") or "Attachment")
            processor.upsert_entity(conn, attachment_id, session_id, "attachment", name, str(attachment.get("mimeType") or ""), {"connector": "gmail", **attachment}, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, attachment_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, message_id, attachment_id, "has_attachment", "Gmail message has attachment", session_id, episode_id, timestamp)
        counts["chunks"] += add_chunk(processor, conn, session_id, f"mcp:gmail:{item.get('id')}", f"{subject}\n{snippet}", {"connector": "gmail", "messageId": item.get("id"), "sourceEpisodeId": episode_id}, timestamp)
    return counts


def ingest_drive(processor: Any, conn: Any, fetch: dict[str, Any], episode_id: str, timestamp: str) -> dict[str, int]:
    session_id = str(fetch["sessionId"])
    request_id = fetch.get("sourceRequestId")
    counts = {"entities": 0, "relations": 0, "chunks": 0}
    for item in require_list(fetch.get("results"), "results"):
        file_id = f"drive_file:{item.get('id')}"
        name = str(item.get("name") or "Drive file")
        snippet = str(item.get("snippet") or "")
        processor.upsert_entity(conn, file_id, session_id, "drive_file", name, snippet, {"connector": "drive", "fileId": item.get("id"), "mimeType": item.get("mimeType"), "webUrl": item.get("webUrl")}, timestamp)
        counts["entities"] += 1
        counts["relations"] += episode_mentions(processor, conn, episode_id, file_id, timestamp, request_id)
        owner = item.get("owner")
        if isinstance(owner, dict):
            owner_id = add_person(processor, conn, session_id, owner, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, owner_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, file_id, owner_id, "owned_by", "Drive file is owned by person", session_id, episode_id, timestamp)
        for shared in require_list(item.get("sharedWith"), "sharedWith"):
            shared_id = add_person(processor, conn, session_id, shared, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, shared_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, file_id, shared_id, "shared_with", "Drive file is shared with person", session_id, episode_id, timestamp)
        folder = item.get("folder")
        if isinstance(folder, dict):
            folder_id = f"drive_folder:{folder.get('id') or processor.stable_id('folder', folder.get('name'))}"
            folder_name = str(folder.get("name") or "Drive folder")
            processor.upsert_entity(conn, folder_id, session_id, "drive_folder", folder_name, folder_name, {"connector": "drive", **folder}, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, folder_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, file_id, folder_id, "contained_in", "Drive file is contained in folder", session_id, episode_id, timestamp)
        for section in require_list(item.get("sections"), "sections"):
            section_id = f"document_section:{section.get('id') or processor.stable_id('section', file_id, section.get('title'))}"
            title = str(section.get("title") or "Document section")
            text = str(section.get("text") or "")
            processor.upsert_entity(conn, section_id, session_id, "document_section", title, text, {"connector": "drive", **section}, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, section_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, section_id, file_id, "contained_in", "Document section belongs to Drive file", session_id, episode_id, timestamp)
            counts["chunks"] += add_chunk(processor, conn, session_id, f"mcp:drive:{section_id}", f"{title}\n{text}", {"connector": "drive", "fileId": item.get("id"), "sourceEpisodeId": episode_id}, timestamp)
        counts["chunks"] += add_chunk(processor, conn, session_id, f"mcp:drive:{item.get('id')}", f"{name}\n{snippet}", {"connector": "drive", "fileId": item.get("id"), "sourceEpisodeId": episode_id}, timestamp)
    return counts


def ingest_calendar(processor: Any, conn: Any, fetch: dict[str, Any], episode_id: str, timestamp: str) -> dict[str, int]:
    session_id = str(fetch["sessionId"])
    request_id = fetch.get("sourceRequestId")
    counts = {"entities": 0, "relations": 0, "chunks": 0}
    for item in require_list(fetch.get("results"), "results"):
        event_id = f"calendar_event:{item.get('id')}"
        title = str(item.get("title") or "Calendar event")
        description = str(item.get("description") or "")
        processor.upsert_entity(conn, event_id, session_id, "calendar_event", title, description, {"connector": "calendar", "eventId": item.get("id"), "start": item.get("start"), "end": item.get("end"), "location": item.get("location")}, timestamp)
        counts["entities"] += 1
        counts["relations"] += episode_mentions(processor, conn, episode_id, event_id, timestamp, request_id)
        time_id = processor.stable_id("time", item.get("start"), item.get("end"))
        processor.upsert_entity(conn, time_id, session_id, "time_anchor", str(item.get("start") or "Event time"), str(item.get("end") or ""), {"start": item.get("start"), "end": item.get("end")}, timestamp)
        counts["entities"] += 1
        counts["relations"] += episode_mentions(processor, conn, episode_id, time_id, timestamp, request_id)
        counts["relations"] += relation(processor, conn, event_id, time_id, "scheduled_at", "Calendar event is scheduled at time", session_id, episode_id, timestamp)
        if item.get("location"):
            location_id = processor.stable_id("location", item.get("location"))
            processor.upsert_entity(conn, location_id, session_id, "location", str(item.get("location")), "Calendar event location", {"connector": "calendar", "location": item.get("location")}, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, location_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, event_id, location_id, "mentions", "Calendar event mentions location", session_id, episode_id, timestamp)
        for attendee in require_list(item.get("attendees"), "attendees"):
            attendee_id = add_person(processor, conn, session_id, attendee, timestamp)
            counts["entities"] += 1
            counts["relations"] += episode_mentions(processor, conn, episode_id, attendee_id, timestamp, request_id)
            counts["relations"] += relation(processor, conn, event_id, attendee_id, "attended_by", "Calendar event includes attendee", session_id, episode_id, timestamp)
            counts["relations"] += relation(processor, conn, event_id, attendee_id, "scheduled_with", "Calendar event is scheduled with person", session_id, episode_id, timestamp)
        counts["chunks"] += add_chunk(processor, conn, session_id, f"mcp:calendar:{item.get('id')}", f"{title}\n{description}\n{item.get('start')} - {item.get('end')}", {"connector": "calendar", "eventId": item.get("id"), "sourceEpisodeId": episode_id}, timestamp)
    return counts


def merge_counts(*items: dict[str, int]) -> dict[str, int]:
    result = {"episodes": 0, "entities": 0, "relations": 0, "chunks": 0}
    for item in items:
        for key, value in item.items():
            result[key] = result.get(key, 0) + int(value)
    return result


def ingest_mcp_fetch(
    processor: Any,
    conn: Any,
    fetch: dict[str, Any],
    database_label: str = "context-graph-server",
) -> dict[str, Any]:
    connector = str(fetch.get("connector") or "")
    if connector not in CONNECTORS:
        raise SystemExit(f"connector must be one of {sorted(CONNECTORS)}")
    require_list(fetch.get("results"), "results")

    timestamp = processor.utc_now()
    processor.init_schema(conn)
    episode_id = upsert_episode(processor, conn, fetch, timestamp)
    counts = {"episodes": 1, "entities": 0, "relations": 0, "chunks": 0}
    if connector == "gmail":
        counts = merge_counts(counts, ingest_gmail(processor, conn, fetch, episode_id, timestamp))
    elif connector == "drive":
        counts = merge_counts(counts, ingest_drive(processor, conn, fetch, episode_id, timestamp))
    elif connector == "calendar":
        counts = merge_counts(counts, ingest_calendar(processor, conn, fetch, episode_id, timestamp))

    return {
        "database": database_label,
        "sessionId": fetch["sessionId"],
        "connector": connector,
        "operation": fetch.get("operation"),
        "episodeId": episode_id,
        "ingested": counts,
    }


def post_mcp_fetch_to_server(server_url: str, fetch: dict[str, Any]) -> dict[str, Any]:
    endpoint = f"{server_url.rstrip('/')}/ingest/mcp-results"
    payload = json.dumps(fetch).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
            return require_object(result, endpoint)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Context graph server rejected MCP result: {exc.code} {body}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest normalized MCP connector results into the context graph.")
    parser.add_argument("--db", required=True, help="DuckDB path to create/update.")
    parser.add_argument("--input", required=True, help="MCP fetch result JSON file.")
    args = parser.parse_args()

    processor = load_processor()
    fetch = require_object(json.loads(Path(args.input).read_text()), args.input)
    server_url = os.environ.get("OPEN_BUBBLE_CONTEXT_GRAPH_URL")
    if server_url:
        print(json.dumps(post_mcp_fetch_to_server(server_url, fetch), indent=2, sort_keys=True))
        return 0

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = processor.duckdb.connect(str(db_path))
    try:
        result = ingest_mcp_fetch(processor, conn, fetch, database_label=str(db_path))
    finally:
        conn.close()

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
