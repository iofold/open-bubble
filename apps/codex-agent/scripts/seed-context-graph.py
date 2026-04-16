#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSOR_PATH = SCRIPT_DIR / "process-context-request.py"


def load_processor() -> Any:
    spec = importlib.util.spec_from_file_location("open_bubble_context_processor", PROCESSOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load processor from {PROCESSOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def require_list(value: Any, label: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"{label} must be an array")
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise SystemExit(f"{label}[{index}] must be an object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the Open Bubble context graph.")
    parser.add_argument("--db", required=True, help="DuckDB path to create/update.")
    parser.add_argument(
        "--fixture",
        default=str(SCRIPT_DIR.parent / "testdata" / "seed-context.json"),
        help="Seed fixture JSON path.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete ontology tables before seeding.",
    )
    args = parser.parse_args()

    processor = load_processor()
    fixture = json.loads(Path(args.fixture).read_text())
    if not isinstance(fixture, dict):
        raise SystemExit("Seed fixture must be a JSON object")

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = processor.duckdb.connect(str(db_path))
    try:
        processor.init_schema(conn)
        if args.reset:
            for table in [
                "graph_relations",
                "graph_entities",
                "graph_episodes",
                "context_chunks",
                "context_requests",
                "session_context",
            ]:
                conn.execute(f"DELETE FROM {table}")

        session_id = str(fixture.get("sessionId") or "session_local")
        timestamp = processor.utc_now()

        session_context = fixture.get("sessionContext") or {}
        if not isinstance(session_context, dict):
            raise SystemExit("sessionContext must be an object")
        for key, value in session_context.items():
            conn.execute(
                """
                INSERT INTO session_context (session_id, key, value, updated_at)
                VALUES (?, ?, ?, CAST(? AS TIMESTAMP))
                ON CONFLICT(session_id, key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_at = EXCLUDED.updated_at
                """,
                [session_id, str(key), processor.json_dumps(value), timestamp],
            )

        episode_count = 0
        for episode in require_list(fixture.get("episodes"), "episodes"):
            processor.upsert_episode(
                conn,
                str(episode["id"]),
                session_id,
                str(episode.get("type") or "seed_context"),
                str(episode.get("source") or args.fixture),
                str(episode.get("content") or ""),
                episode.get("metadata") if isinstance(episode.get("metadata"), dict) else {},
                str(episode.get("createdAt") or timestamp),
                timestamp,
            )
            episode_count += 1

        entity_count = 0
        for entity in require_list(fixture.get("entities"), "entities"):
            processor.upsert_entity(
                conn,
                str(entity["id"]),
                session_id,
                str(entity["type"]),
                str(entity["name"]),
                str(entity.get("description") or ""),
                entity.get("metadata") if isinstance(entity.get("metadata"), dict) else {},
                timestamp,
            )
            entity_count += 1

        relation_count = 0
        for relation in require_list(fixture.get("relations"), "relations"):
            processor.upsert_relation(
                conn,
                str(relation["id"]),
                str(relation["sourceId"]),
                str(relation["targetId"]),
                str(relation["type"]),
                relation.get("metadata") if isinstance(relation.get("metadata"), dict) else {},
                timestamp,
                weight=float(relation.get("weight", 1.0)),
                fact=str(relation.get("fact") or relation["type"]),
                confidence=float(relation.get("confidence", 0.8)),
                source_episode_id=(
                    str(relation["sourceEpisodeId"]) if relation.get("sourceEpisodeId") else None
                ),
                valid_at=str(relation.get("validAt") or timestamp),
                invalid_at=(
                    str(relation["invalidAt"]) if relation.get("invalidAt") else None
                ),
            )
            relation_count += 1

        chunk_count = 0
        for chunk in require_list(fixture.get("chunks"), "chunks"):
            processor.upsert_chunk(
                conn,
                str(chunk["id"]),
                session_id,
                str(chunk["source"]),
                str(chunk["text"]),
                chunk.get("metadata") if isinstance(chunk.get("metadata"), dict) else {},
                timestamp,
            )
            chunk_count += 1
    finally:
        conn.close()

    print(
        json.dumps(
            {
                "database": str(db_path),
                "sessionId": session_id,
                "episodes": episode_count,
                "entities": entity_count,
                "relations": relation_count,
                "chunks": chunk_count,
                "sessionContextKeys": len(session_context),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
