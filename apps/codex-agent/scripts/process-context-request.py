#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    import duckdb
except Exception as exc:  # pragma: no cover - exercised only when runtime is incomplete
    print(f"python duckdb package is required: {exc}", file=sys.stderr)
    sys.exit(69)


FETCH_MARKERS = {
    "what",
    "why",
    "how",
    "when",
    "where",
    "which",
    "who",
    "next",
    "answer",
    "respond",
    "response",
    "summarize",
    "summary",
    "explain",
    "tell",
    "show",
    "find",
    "fetch",
    "query",
}

INGEST_ONLY_MARKERS = {
    "remember",
    "save",
    "store",
    "capture",
    "record",
    "note",
    "log",
}

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "based",
    "be",
    "by",
    "for",
    "from",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "should",
    "that",
    "the",
    "this",
    "to",
    "what",
    "with",
}


@dataclass(frozen=True)
class IngestIds:
    episode: str
    session: str
    device: str
    intent: str
    request: str
    screenshot: str
    voice_note: str
    app: str | None


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str, *parts: object) -> str:
    raw = "|".join(str(part) for part in parts if part is not None)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def load_request() -> dict[str, Any]:
    inline = os.environ.get("OPEN_BUBBLE_CONTEXT_REQUEST")
    if inline:
        return require_object(json.loads(inline), "OPEN_BUBBLE_CONTEXT_REQUEST")

    request_file = os.environ.get("OPEN_BUBBLE_CONTEXT_REQUEST_FILE")
    if request_file:
        return require_object(json.loads(Path(request_file).read_text()), request_file)

    fallback = Path("requests/latest.json")
    if fallback.exists():
        return require_object(json.loads(fallback.read_text()), str(fallback))

    raise SystemExit(
        "No context request found. Set OPEN_BUBBLE_CONTEXT_REQUEST or "
        "OPEN_BUBBLE_CONTEXT_REQUEST_FILE."
    )


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SystemExit(f"{label} must contain a JSON object")
    return value


def get_session_id(request: dict[str, Any]) -> str:
    return str(
        request.get("sessionId")
        or os.environ.get("OPEN_BUBBLE_SESSION_ID")
        or "session_local"
    )


def get_request_id(request: dict[str, Any], session_id: str) -> str:
    return str(
        request.get("id")
        or request.get("requestId")
        or stable_id("ctx_req", session_id, request.get("createdAt"), request.get("deviceId"))
    )


def transcript_from_request(request: dict[str, Any]) -> str:
    prompt = request.get("prompt")
    if not isinstance(prompt, dict):
        return ""
    return str(prompt.get("transcript") or "").strip()


def screen_metadata(request: dict[str, Any]) -> dict[str, Any]:
    screenshot = request.get("screenshot")
    if not isinstance(screenshot, dict):
        return {}
    metadata = screenshot.get("screenMetadata")
    return metadata if isinstance(metadata, dict) else {}


def boolean_true(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return False


def classify_intent(request: dict[str, Any], transcript: str) -> str:
    explicit_intent = str(request.get("intent") or "").strip()
    explicit_assertion = boolean_true(request.get("userExplicitlyRequestedCodeAssertion"))
    if explicit_intent == "code_assertion" and explicit_assertion:
        return "code_assertion"

    words = set(tokenize(transcript))
    if words & INGEST_ONLY_MARKERS and not (words & FETCH_MARKERS) and "?" not in transcript:
        return "ingest_only"
    if words & FETCH_MARKERS or "?" in transcript or explicit_intent == "context_question":
        return "fetch_response"
    return "fetch_response" if transcript else "ingest_only"


def tokenize(text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9][a-z0-9_/-]{1,}", text.lower())
        if token not in STOPWORDS
    ]


def decode_size(value: Any) -> int | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return len(base64.b64decode(value, validate=False))
    except Exception:
        return None


def summarize_screenshot(request: dict[str, Any]) -> dict[str, Any]:
    screenshot = request.get("screenshot") if isinstance(request.get("screenshot"), dict) else {}
    metadata = screen_metadata(request)
    visible_text = str(metadata.get("visibleText") or "").strip()
    app_package = str(metadata.get("appPackage") or "").strip()
    image_size = decode_size(screenshot.get("imageBase64"))
    image_hash = None
    if isinstance(screenshot.get("imageBase64"), str) and screenshot.get("imageBase64"):
        image_hash = hashlib.sha256(screenshot["imageBase64"].encode("utf-8")).hexdigest()

    observations: list[str] = []
    if app_package:
        observations.append(f"App package: {app_package}")
    if visible_text:
        observations.append(f"Visible text: {visible_text}")
    if image_size is not None:
        observations.append(f"Image bytes: {image_size}")
    if not observations:
        observations.append("Screenshot supplied without analyzable metadata")

    return {
        "summary": "; ".join(observations),
        "metadata": metadata,
        "mimeType": screenshot.get("mimeType"),
        "capturedAt": screenshot.get("capturedAt"),
        "imageBytes": image_size,
        "imageHash": image_hash,
        "analysisMode": "metadata_only",
    }


def summarize_voice(request: dict[str, Any], transcript: str) -> dict[str, Any]:
    prompt = request.get("prompt") if isinstance(request.get("prompt"), dict) else {}
    audio_size = decode_size(prompt.get("audioBase64"))
    audio_hash = None
    if isinstance(prompt.get("audioBase64"), str) and prompt.get("audioBase64"):
        audio_hash = hashlib.sha256(prompt["audioBase64"].encode("utf-8")).hexdigest()

    tokens = tokenize(transcript)
    return {
        "summary": transcript or "Voice prompt supplied without transcript",
        "transcript": transcript,
        "keywords": tokens[:12],
        "language": prompt.get("language"),
        "audioMimeType": prompt.get("audioMimeType"),
        "capturedAt": prompt.get("capturedAt"),
        "audioBytes": audio_size,
        "audioHash": audio_hash,
        "analysisMode": "transcript_keywords" if transcript else "metadata_only",
    }


def init_schema(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS session_context (
            session_id VARCHAR,
            key VARCHAR,
            value VARCHAR,
            updated_at TIMESTAMP,
            PRIMARY KEY (session_id, key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_episodes (
            id VARCHAR PRIMARY KEY,
            session_id VARCHAR,
            type VARCHAR,
            source VARCHAR,
            content VARCHAR,
            metadata VARCHAR,
            created_at TIMESTAMP,
            ingested_at TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_entities (
            id VARCHAR PRIMARY KEY,
            session_id VARCHAR,
            type VARCHAR,
            name VARCHAR,
            description VARCHAR,
            metadata VARCHAR,
            updated_at TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_relations (
            id VARCHAR PRIMARY KEY,
            source_id VARCHAR,
            target_id VARCHAR,
            type VARCHAR,
            fact VARCHAR,
            weight DOUBLE,
            confidence DOUBLE,
            valid_at TIMESTAMP,
            invalid_at TIMESTAMP,
            source_episode_id VARCHAR,
            metadata VARCHAR,
            updated_at TIMESTAMP
        )
        """
    )
    for column_sql in [
        "ALTER TABLE graph_relations ADD COLUMN IF NOT EXISTS fact VARCHAR",
        "ALTER TABLE graph_relations ADD COLUMN IF NOT EXISTS confidence DOUBLE",
        "ALTER TABLE graph_relations ADD COLUMN IF NOT EXISTS valid_at TIMESTAMP",
        "ALTER TABLE graph_relations ADD COLUMN IF NOT EXISTS invalid_at TIMESTAMP",
        "ALTER TABLE graph_relations ADD COLUMN IF NOT EXISTS source_episode_id VARCHAR",
    ]:
        conn.execute(column_sql)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS context_chunks (
            id VARCHAR PRIMARY KEY,
            session_id VARCHAR,
            source VARCHAR,
            text VARCHAR,
            metadata VARCHAR,
            updated_at TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS context_requests (
            id VARCHAR PRIMARY KEY,
            session_id VARCHAR,
            device_id VARCHAR,
            intent VARCHAR,
            classified_intent VARCHAR,
            transcript VARCHAR,
            screenshot_summary VARCHAR,
            raw_json VARCHAR,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
        """
    )


def upsert_episode(
    conn: duckdb.DuckDBPyConnection,
    episode_id: str,
    session_id: str,
    episode_type: str,
    source: str,
    content: str,
    metadata: dict[str, Any],
    created_at: str,
    ingested_at: str,
) -> None:
    conn.execute(
        """
        INSERT INTO graph_episodes
            (id, session_id, type, source, content, metadata, created_at, ingested_at)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            session_id = EXCLUDED.session_id,
            type = EXCLUDED.type,
            source = EXCLUDED.source,
            content = EXCLUDED.content,
            metadata = EXCLUDED.metadata,
            created_at = EXCLUDED.created_at,
            ingested_at = EXCLUDED.ingested_at
        """,
        [
            episode_id,
            session_id,
            episode_type,
            source,
            content,
            json_dumps(metadata),
            created_at,
            ingested_at,
        ],
    )


def upsert_entity(
    conn: duckdb.DuckDBPyConnection,
    entity_id: str,
    session_id: str,
    entity_type: str,
    name: str,
    description: str,
    metadata: dict[str, Any],
    timestamp: str,
) -> None:
    conn.execute(
        """
        INSERT INTO graph_entities
            (id, session_id, type, name, description, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            session_id = EXCLUDED.session_id,
            type = EXCLUDED.type,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        """,
        [entity_id, session_id, entity_type, name, description, json_dumps(metadata), timestamp],
    )


def upsert_relation(
    conn: duckdb.DuckDBPyConnection,
    relation_id: str,
    source_id: str,
    target_id: str,
    relation_type: str,
    metadata: dict[str, Any],
    timestamp: str,
    weight: float = 1.0,
    fact: str | None = None,
    confidence: float = 0.8,
    source_episode_id: str | None = None,
    valid_at: str | None = None,
    invalid_at: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO graph_relations
            (id, source_id, target_id, type, fact, weight, confidence, valid_at,
             invalid_at, source_episode_id, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?, ?, CAST(? AS TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            source_id = EXCLUDED.source_id,
            target_id = EXCLUDED.target_id,
            type = EXCLUDED.type,
            fact = EXCLUDED.fact,
            weight = EXCLUDED.weight,
            confidence = EXCLUDED.confidence,
            valid_at = EXCLUDED.valid_at,
            invalid_at = EXCLUDED.invalid_at,
            source_episode_id = EXCLUDED.source_episode_id,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        """,
        [
            relation_id,
            source_id,
            target_id,
            relation_type,
            fact or relation_type.replace("_", " "),
            weight,
            confidence,
            valid_at or timestamp,
            invalid_at,
            source_episode_id,
            json_dumps(metadata),
            timestamp,
        ],
    )


def upsert_chunk(
    conn: duckdb.DuckDBPyConnection,
    chunk_id: str,
    session_id: str,
    source: str,
    text: str,
    metadata: dict[str, Any],
    timestamp: str,
) -> None:
    conn.execute(
        """
        INSERT INTO context_chunks
            (id, session_id, source, text, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            session_id = EXCLUDED.session_id,
            source = EXCLUDED.source,
            text = EXCLUDED.text,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        """,
        [chunk_id, session_id, source, text, json_dumps(metadata), timestamp],
    )


def ingest_request(
    conn: duckdb.DuckDBPyConnection,
    request: dict[str, Any],
    session_id: str,
    request_id: str,
    classified_intent: str,
    screenshot_analysis: dict[str, Any],
    voice_analysis: dict[str, Any],
) -> dict[str, int]:
    timestamp = utc_now()
    device_id = str(request.get("deviceId") or "device_unknown")
    ids = IngestIds(
        episode=f"episode:{request_id}",
        session=f"session:{session_id}",
        device=stable_id("device", device_id),
        intent=stable_id("intent", classified_intent),
        request=f"request:{request_id}",
        screenshot=f"screenshot:{request_id}",
        voice_note=f"voice:{request_id}",
        app=(
            stable_id("app", screen_metadata(request).get("appPackage"))
            if screen_metadata(request).get("appPackage")
            else None
        ),
    )
    episode_content = "\n".join(
        part
        for part in [voice_analysis["transcript"], screenshot_analysis["summary"]]
        if part
    )
    upsert_episode(
        conn,
        ids.episode,
        session_id,
        "frontend_context_request",
        "open_bubble_frontend",
        episode_content,
        {
            "requestId": request_id,
            "deviceId": device_id,
            "clientIntent": request.get("intent"),
            "classifiedIntent": classified_intent,
            "ontologyVersion": "open-bubble-context-v0",
        },
        request.get("createdAt") or timestamp,
        timestamp,
    )

    conn.execute(
        """
        INSERT INTO context_requests
            (id, session_id, device_id, intent, classified_intent, transcript,
             screenshot_summary, raw_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP))
        ON CONFLICT(id) DO UPDATE SET
            session_id = EXCLUDED.session_id,
            device_id = EXCLUDED.device_id,
            intent = EXCLUDED.intent,
            classified_intent = EXCLUDED.classified_intent,
            transcript = EXCLUDED.transcript,
            screenshot_summary = EXCLUDED.screenshot_summary,
            raw_json = EXCLUDED.raw_json,
            updated_at = EXCLUDED.updated_at
        """,
        [
            request_id,
            session_id,
            request.get("deviceId"),
            request.get("intent"),
            classified_intent,
            voice_analysis["transcript"],
            screenshot_analysis["summary"],
            json_dumps(request),
            request.get("createdAt") or timestamp,
            timestamp,
        ],
    )

    upsert_entity(
        conn,
        ids.session,
        session_id,
        "agent_session",
        session_id,
        f"Open Bubble agent session {session_id}",
        {"sessionId": session_id},
        timestamp,
    )
    upsert_entity(
        conn,
        ids.device,
        session_id,
        "frontend_device",
        device_id,
        f"Frontend device {device_id}",
        {"deviceId": device_id},
        timestamp,
    )
    upsert_entity(
        conn,
        ids.intent,
        session_id,
        "user_intent",
        classified_intent,
        f"Classified user intent: {classified_intent}",
        {"classifiedIntent": classified_intent, "clientIntent": request.get("intent")},
        timestamp,
    )
    upsert_entity(
        conn,
        ids.request,
        session_id,
        "context_request",
        f"Context request {request_id}",
        voice_analysis["transcript"] or screenshot_analysis["summary"],
        {"requestId": request_id, "classifiedIntent": classified_intent},
        timestamp,
    )
    upsert_entity(
        conn,
        ids.screenshot,
        session_id,
        "screenshot_observation",
        f"Screenshot for {request_id}",
        screenshot_analysis["summary"],
        screenshot_analysis,
        timestamp,
    )
    upsert_entity(
        conn,
        ids.voice_note,
        session_id,
        "voice_note",
        f"Voice note for {request_id}",
        voice_analysis["summary"],
        voice_analysis,
        timestamp,
    )

    entities = 6
    relations = 0

    for target_id, rel_type, fact in [
        (ids.session, "episode_mentions", "Episode occurred in session"),
        (ids.device, "episode_mentions", "Episode mentions frontend device"),
        (ids.intent, "episode_mentions", "Episode expresses user intent"),
        (ids.request, "episode_mentions", "Episode contains context request"),
        (ids.screenshot, "episode_mentions", "Episode contains screenshot observation"),
        (ids.voice_note, "episode_mentions", "Episode contains voice note"),
    ]:
        upsert_relation(
            conn,
            stable_id("rel", ids.episode, target_id, rel_type),
            ids.episode,
            target_id,
            rel_type,
            {"requestId": request_id},
            timestamp,
            fact=fact,
            source_episode_id=ids.episode,
        )
        relations += 1

    if ids.app:
        app_package = str(screen_metadata(request).get("appPackage"))
        upsert_entity(
            conn,
            ids.app,
            session_id,
            "screen_app",
            app_package,
            f"Phone app visible during request: {app_package}",
            {"appPackage": app_package},
            timestamp,
        )
        upsert_relation(
            conn,
            stable_id("rel", ids.episode, ids.app, "episode_mentions"),
            ids.episode,
            ids.app,
            "episode_mentions",
            {"requestId": request_id},
            timestamp,
            fact="Episode mentions screen app",
            source_episode_id=ids.episode,
        )
        upsert_relation(
            conn,
            stable_id("rel", ids.screenshot, ids.app, "observed_app"),
            ids.screenshot,
            ids.app,
            "observed_app",
            {"requestId": request_id},
            timestamp,
            fact="Screenshot observed app",
            source_episode_id=ids.episode,
        )
        entities += 1
        relations += 2

    for target_id, rel_type, fact in [
        (ids.session, "in_session", "Context request belongs to session"),
        (ids.device, "from_device", "Context request came from frontend device"),
        (ids.intent, "expresses_intent", "Context request expresses classified intent"),
        (ids.screenshot, "has_screenshot", "Context request includes screenshot"),
        (ids.voice_note, "has_voice_note", "Context request includes voice note"),
    ]:
        upsert_relation(
            conn,
            stable_id("rel", ids.request, target_id, rel_type),
            ids.request,
            target_id,
            rel_type,
            {"requestId": request_id},
            timestamp,
            fact=fact,
            source_episode_id=ids.episode,
        )
        relations += 1

    chunk_count = 0
    chunks = [
        ("voice", voice_analysis["transcript"], voice_analysis),
        ("screenshot", screenshot_analysis["summary"], screenshot_analysis),
        (
            "combined",
            "\n".join(
                part
                for part in [voice_analysis["transcript"], screenshot_analysis["summary"]]
                if part
            ),
            {"requestId": request_id, "classifiedIntent": classified_intent},
        ),
    ]
    for source, text, metadata in chunks:
        if text:
            upsert_chunk(
                conn,
                stable_id("chunk", request_id, source),
                session_id,
                f"{source}:{request_id}",
                text,
                metadata,
                timestamp,
            )
            chunk_count += 1

    conn.execute(
        """
        INSERT INTO session_context (session_id, key, value, updated_at)
        VALUES (?, ?, ?, CAST(? AS TIMESTAMP))
        ON CONFLICT(session_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = EXCLUDED.updated_at
        """,
        [
            session_id,
            "last_context_request",
            json_dumps(
                {
                    "requestId": request_id,
                    "classifiedIntent": classified_intent,
                    "transcript": voice_analysis["transcript"],
                    "screenshot": screenshot_analysis["summary"],
                }
            ),
            timestamp,
        ],
    )

    return {"entities": entities, "relations": relations, "chunks": chunk_count, "requests": 1}


def query_relevant_context(
    conn: duckdb.DuckDBPyConnection,
    session_id: str,
    transcript: str,
    current_request_id: str,
    limit: int = 8,
) -> list[dict[str, Any]]:
    terms = tokenize(transcript)[:8]
    rows: list[dict[str, Any]] = []

    if terms:
        clauses = " OR ".join(["lower(text) LIKE ?" for _ in terms])
        params: list[Any] = [session_id, current_request_id]
        params.extend([f"%{term}%" for term in terms])
        params.append(limit)
        cursor = conn.execute(
            f"""
            SELECT id, source, text, metadata, updated_at
            FROM context_chunks
            WHERE session_id = ?
              AND source NOT LIKE '%' || ? || '%'
              AND ({clauses})
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            params,
        )
        rows = rows_to_dicts(cursor)

    if len(rows) < limit:
        cursor = conn.execute(
            """
            SELECT id, source, text, metadata, updated_at
            FROM context_chunks
            WHERE session_id = ?
              AND source NOT LIKE '%' || ? || '%'
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            [session_id, current_request_id, limit - len(rows)],
        )
        seen = {row["id"] for row in rows}
        rows.extend(row for row in rows_to_dicts(cursor) if row["id"] not in seen)

    return rows[:limit]


def rows_to_dicts(cursor: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row, strict=False)) for row in cursor.fetchall()]


def parse_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def load_session_context(conn: duckdb.DuckDBPyConnection, session_id: str) -> dict[str, str]:
    cursor = conn.execute(
        "SELECT key, value FROM session_context WHERE session_id = ? ORDER BY updated_at DESC",
        [session_id],
    )
    return {str(key): str(value) for key, value in cursor.fetchall()}


def build_answer(
    request: dict[str, Any],
    classified_intent: str,
    session_id: str,
    request_id: str,
    screenshot_analysis: dict[str, Any],
    voice_analysis: dict[str, Any],
    session_context: dict[str, str],
    relevant_chunks: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if classified_intent == "ingest_only":
        return None

    context_used = ["request", "duckdb:context_requests", "duckdb:context_chunks"]
    connectors_used = sorted(
        {
            str(parse_json_object(chunk.get("metadata")).get("connector"))
            for chunk in relevant_chunks
            if parse_json_object(chunk.get("metadata")).get("connector")
        }
    )
    for connector in connectors_used:
        context_used.append(f"mcp:{connector}")
    if session_context:
        context_used.append("duckdb:session_context")
    if screenshot_analysis["summary"]:
        context_used.append("screenshot:metadata")
    if voice_analysis["transcript"]:
        context_used.append("voice:transcript")

    if classified_intent == "code_assertion":
        summary = "I ingested the screenshot and voice note. A code assertion needs deeper code inspection before a firm verdict."
        verdict = "inconclusive"
        reasoning = (
            "The request explicitly asked for code assertion, but this fast ingestion pass only "
            "analyzes the prompt, screenshot metadata, and existing context graph."
        )
        if relevant_chunks:
            summary = "I found related context, but the assertion still needs a code-aware verification pass."
        return {
            "summary": summary,
            "details": build_details(
                request_id,
                session_id,
                screenshot_analysis,
                voice_analysis,
                session_context,
                relevant_chunks,
            ),
            "confidence": "low",
            "retrievalMode": "mixed",
            "localContextUsed": context_used,
            "codeAssertionResult": {
                "verdict": verdict,
                "reasoning": reasoning,
                "evidence": [chunk["source"] for chunk in relevant_chunks[:5]],
            },
        }

    prompt = voice_analysis["transcript"]
    if relevant_chunks:
        first = relevant_chunks[0]
        summary = summarize_chunk_answer(prompt, str(first.get("text") or ""))
        confidence = "medium"
    elif screenshot_analysis["summary"] and screenshot_analysis["summary"] != "Screenshot supplied without analyzable metadata":
        summary = f"I ingested the request. The current screenshot context says: {screenshot_analysis['summary']}"
        confidence = "medium"
    elif session_context.get("last_context_request"):
        summary = "I ingested the new phone context and found session state, but no older matching graph context yet."
        confidence = "low"
    else:
        summary = "I ingested the screenshot and voice note, but the context graph does not have enough prior context to answer yet."
        confidence = "low"

    return {
        "summary": summary,
        "details": build_details(
            request_id,
            session_id,
            screenshot_analysis,
            voice_analysis,
            session_context,
            relevant_chunks,
        ),
        "confidence": confidence,
        "retrievalMode": "direct_duckdb",
        "localContextUsed": context_used,
    }


def summarize_chunk_answer(prompt: str, chunk_text: str) -> str:
    prompt_l = prompt.lower()
    clean_chunk = " ".join(chunk_text.split())
    if len(clean_chunk) > 180:
        clean_chunk = clean_chunk[:177].rstrip() + "..."

    if "next" in prompt_l or "what should" in prompt_l:
        return f"Based on the context graph, the next useful step is tied to: {clean_chunk}"
    if "summar" in prompt_l:
        return f"The relevant context is: {clean_chunk}"
    if "what" in prompt_l or "explain" in prompt_l:
        return f"The context graph points to this answer: {clean_chunk}"
    return f"I found matching context: {clean_chunk}"


def build_details(
    request_id: str,
    session_id: str,
    screenshot_analysis: dict[str, Any],
    voice_analysis: dict[str, Any],
    session_context: dict[str, str],
    relevant_chunks: list[dict[str, Any]],
) -> str:
    parts = [
        f"Request {request_id} was ingested for session {session_id}.",
        f"Voice analysis: {voice_analysis['analysisMode']}.",
        f"Screenshot analysis: {screenshot_analysis['analysisMode']} ({screenshot_analysis['summary']}).",
    ]
    if relevant_chunks:
        sources = ", ".join(str(chunk["source"]) for chunk in relevant_chunks[:5])
        parts.append(f"Matched graph chunks: {sources}.")
    else:
        parts.append("No older matching context chunks were found.")
    if session_context:
        parts.append(f"Session context keys: {', '.join(sorted(session_context)[:8])}.")
    return " ".join(parts)


def write_outputs(result: dict[str, Any], answer_only: bool) -> None:
    response_file = os.environ.get("OPEN_BUBBLE_RESPONSE_FILE")
    response_payload = result.get("answer") if answer_only else result
    if response_payload is None:
        response_payload = {
            "summary": "Context ingested.",
            "details": "The voice prompt was classified as ingest-only, so no response was requested.",
            "confidence": "high",
            "retrievalMode": "direct_duckdb",
            "localContextUsed": ["request", "duckdb:context_requests"],
        }

    payload_text = json.dumps(response_payload, ensure_ascii=True, indent=2) + "\n"
    if response_file:
        response_path = Path(response_file)
        response_path.parent.mkdir(parents=True, exist_ok=True)
        response_path.write_text(payload_text)
    print(json.dumps(result, ensure_ascii=True, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest an Open Bubble context request.")
    parser.add_argument(
        "--db",
        default=os.environ.get("OPEN_BUBBLE_CONTEXT_DB") or "data/context.duckdb",
        help="DuckDB path. Defaults to OPEN_BUBBLE_CONTEXT_DB or data/context.duckdb.",
    )
    parser.add_argument(
        "--answer-only",
        action="store_true",
        help="Write only ContextAnswer JSON to OPEN_BUBBLE_RESPONSE_FILE.",
    )
    args = parser.parse_args()

    request = load_request()
    session_id = get_session_id(request)
    request_id = get_request_id(request, session_id)
    transcript = transcript_from_request(request)
    classified_intent = classify_intent(request, transcript)
    screenshot_analysis = summarize_screenshot(request)
    voice_analysis = summarize_voice(request, transcript)

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(db_path))
    try:
        init_schema(conn)
        ingested = ingest_request(
            conn,
            request,
            session_id,
            request_id,
            classified_intent,
            screenshot_analysis,
            voice_analysis,
        )
        session_context = load_session_context(conn, session_id)
        relevant_chunks = query_relevant_context(conn, session_id, transcript, request_id)
        answer = build_answer(
            request,
            classified_intent,
            session_id,
            request_id,
            screenshot_analysis,
            voice_analysis,
            session_context,
            relevant_chunks,
        )
    finally:
        conn.close()

    result = {
        "requestId": request_id,
        "sessionId": session_id,
        "classifiedIntent": classified_intent,
        "ingested": ingested,
        "answerProduced": answer is not None,
        "answer": answer,
        "database": str(db_path),
    }
    write_outputs(result, answer_only=args.answer_only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
