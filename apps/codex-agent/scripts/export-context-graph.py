#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any
import urllib.parse
import urllib.request

import duckdb


def parse_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {"raw": value}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def rows_to_dicts(cursor: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row, strict=False)) for row in cursor.fetchall()]


def export_graph_from_conn(
    conn: duckdb.DuckDBPyConnection,
    session_id: str,
    connector: str | None = None,
) -> dict[str, Any]:
    entity_rows = rows_to_dicts(
        conn.execute(
            """
            SELECT id, type, name, description, metadata, updated_at
            FROM graph_entities
            WHERE session_id = ?
            ORDER BY type, name
            """,
            [session_id],
        )
    )
    episode_rows = rows_to_dicts(
        conn.execute(
            """
            SELECT id, type, source, content, metadata, created_at, ingested_at
            FROM graph_episodes
            WHERE session_id = ?
            ORDER BY ingested_at, id
            """,
            [session_id],
        )
    )
    relation_rows = rows_to_dicts(
        conn.execute(
            """
            SELECT id, source_id, target_id, type, fact, confidence,
                   source_episode_id, metadata, valid_at, invalid_at
            FROM graph_relations
            ORDER BY updated_at, id
            """
        )
    )
    chunk_count = int(
        (conn.execute("SELECT COUNT(*) FROM context_chunks WHERE session_id = ?", [session_id]).fetchone() or [0])[0]
    )

    nodes: list[dict[str, Any]] = []
    for row in entity_rows:
        metadata = parse_metadata(row.get("metadata"))
        if connector and metadata.get("connector") != connector:
            continue
        nodes.append(
            {
                "id": row["id"],
                "type": row["type"],
                "label": row["name"],
                "description": row.get("description") or "",
                "metadata": metadata,
                "updatedAt": str(row.get("updated_at")) if row.get("updated_at") else None,
                "isEpisode": False,
            }
        )
    for row in episode_rows:
        metadata = parse_metadata(row.get("metadata"))
        if connector and metadata.get("connector") != connector:
            continue
        nodes.append(
            {
                "id": row["id"],
                "type": row["type"],
                "label": row["type"].replace("_", " "),
                "description": row.get("content") or "",
                "metadata": metadata,
                "updatedAt": str(row.get("ingested_at")) if row.get("ingested_at") else None,
                "isEpisode": True,
            }
        )

    node_ids = {node["id"] for node in nodes}
    edges = [
        {
            "id": row["id"],
            "source": row["source_id"],
            "target": row["target_id"],
            "type": row["type"],
            "label": row.get("fact") or row["type"],
            "confidence": row.get("confidence"),
            "sourceEpisodeId": row.get("source_episode_id"),
            "metadata": parse_metadata(row.get("metadata")),
            "validAt": str(row.get("valid_at")) if row.get("valid_at") else None,
            "invalidAt": str(row.get("invalid_at")) if row.get("invalid_at") else None,
        }
        for row in relation_rows
        if row.get("source_id") in node_ids and row.get("target_id") in node_ids
    ]
    episodes = [node for node in nodes if node.get("isEpisode")]
    type_counts: dict[str, int] = {}
    connector_counts: dict[str, int] = {}
    for node in nodes:
        type_counts[node["type"]] = type_counts.get(node["type"], 0) + 1
        node_connector = node.get("metadata", {}).get("connector") or "local"
        connector_counts[node_connector] = connector_counts.get(node_connector, 0) + 1

    return {
        "sessionId": session_id,
        "nodes": nodes,
        "edges": edges,
        "episodes": episodes,
        "stats": {
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "episodeCount": len(episodes),
            "chunkCount": chunk_count,
            "typeCounts": type_counts,
            "connectorCounts": connector_counts,
        },
    }


def export_graph(db_path: str, session_id: str, connector: str | None = None) -> dict[str, Any]:
    conn = duckdb.connect(db_path)
    try:
        return export_graph_from_conn(conn, session_id, connector)
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Open Bubble context graph JSON.")
    parser.add_argument("--db", required=True, help="DuckDB path.")
    parser.add_argument("--session-id", required=True, help="Session id to export.")
    parser.add_argument("--connector", choices=["gmail", "drive", "calendar"], help="Optional connector filter.")
    parser.add_argument("--out", help="Write JSON to file instead of stdout.")
    args = parser.parse_args()

    server_url = os.environ.get("OPEN_BUBBLE_CONTEXT_GRAPH_URL")
    if server_url:
        query = {"sessionId": args.session_id}
        if args.connector:
            query["connector"] = args.connector
        endpoint = f"{server_url.rstrip('/')}/context-graph?{urllib.parse.urlencode(query)}"
        with urllib.request.urlopen(endpoint, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    else:
        payload = export_graph(args.db, args.session_id, args.connector)
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text)
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
