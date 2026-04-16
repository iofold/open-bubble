#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import mimetypes
import subprocess
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from processor_loader import load_processor


SCRIPT_DIR = Path(__file__).resolve().parent
AGENT_DIR = SCRIPT_DIR.parent
CONTROL_PANEL_DIR = AGENT_DIR / "control-panel"
EXPORTER_PATH = SCRIPT_DIR / "export-context-graph.py"
MCP_INGEST_PATH = SCRIPT_DIR / "ingest-mcp-results.py"


def load_exporter() -> Any:
    spec = importlib.util.spec_from_file_location("open_bubble_context_graph_exporter", EXPORTER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load exporter from {EXPORTER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_mcp_ingester() -> Any:
    spec = importlib.util.spec_from_file_location("open_bubble_mcp_ingester", MCP_INGEST_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load MCP ingester from {MCP_INGEST_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tailscale_ip() -> str | None:
    try:
        result = subprocess.run(
            ["tailscale", "ip", "-4"],
            text=True,
            capture_output=True,
            check=True,
        )
    except Exception:
        return None
    for line in result.stdout.splitlines():
        candidate = line.strip()
        if candidate:
            return candidate
    return None


def resolve_host(host: str) -> str:
    if host == "tailscale":
        return tailscale_ip() or "127.0.0.1"
    return host


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("content-length") or "0")
    if length < 1:
        return {}
    raw = handler.rfile.read(length)
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")
    return payload


class ContextGraphStore:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.processor = load_processor()
        self.exporter = load_exporter()
        self.mcp_ingester = load_mcp_ingester()
        self.lock = threading.RLock()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = self.processor.duckdb.connect(str(self.db_path))
        with self.lock:
            self.processor.init_schema(self.conn)

    def close(self) -> None:
        with self.lock:
            self.conn.close()

    def seed(self, fixture: dict[str, Any], reset: bool = False) -> dict[str, Any]:
        with self.lock:
            if reset:
                for table in [
                    "graph_relations",
                    "graph_entities",
                    "graph_episodes",
                    "context_chunks",
                    "context_requests",
                    "session_context",
                ]:
                    self.conn.execute(f"DELETE FROM {table}")

            session_id = str(fixture.get("sessionId") or "session_local")
            timestamp = self.processor.utc_now()
            session_context = fixture.get("sessionContext") or {}
            if not isinstance(session_context, dict):
                raise ValueError("sessionContext must be an object")
            for key, value in session_context.items():
                self.conn.execute(
                    """
                    INSERT INTO session_context (session_id, key, value, updated_at)
                    VALUES (?, ?, ?, CAST(? AS TIMESTAMP))
                    ON CONFLICT(session_id, key) DO UPDATE SET
                        value = EXCLUDED.value,
                        updated_at = EXCLUDED.updated_at
                    """,
                    [session_id, str(key), self.processor.json_dumps(value), timestamp],
                )

            episodes = fixture.get("episodes") or []
            entities = fixture.get("entities") or []
            relations = fixture.get("relations") or []
            chunks = fixture.get("chunks") or []
            for episode in episodes:
                self.processor.upsert_episode(
                    self.conn,
                    str(episode["id"]),
                    session_id,
                    str(episode.get("type") or "seed_context"),
                    str(episode.get("source") or "server-seed"),
                    str(episode.get("content") or ""),
                    episode.get("metadata") if isinstance(episode.get("metadata"), dict) else {},
                    str(episode.get("createdAt") or timestamp),
                    timestamp,
                )
            for entity in entities:
                self.processor.upsert_entity(
                    self.conn,
                    str(entity["id"]),
                    session_id,
                    str(entity["type"]),
                    str(entity["name"]),
                    str(entity.get("description") or ""),
                    entity.get("metadata") if isinstance(entity.get("metadata"), dict) else {},
                    timestamp,
                )
            for relation in relations:
                self.processor.upsert_relation(
                    self.conn,
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
                    invalid_at=str(relation["invalidAt"]) if relation.get("invalidAt") else None,
                )
            for chunk in chunks:
                self.processor.upsert_chunk(
                    self.conn,
                    str(chunk["id"]),
                    session_id,
                    str(chunk["source"]),
                    str(chunk["text"]),
                    chunk.get("metadata") if isinstance(chunk.get("metadata"), dict) else {},
                    timestamp,
                )
            return {
                "database": str(self.db_path),
                "sessionId": session_id,
                "episodes": len(episodes),
                "entities": len(entities),
                "relations": len(relations),
                "chunks": len(chunks),
                "sessionContextKeys": len(session_context),
            }

    def ingest_context_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = payload.get("request", payload)
        if not isinstance(request, dict):
            raise ValueError("request must be a JSON object")
        with self.lock:
            return self.processor.process_context_request(
                self.conn,
                request,
                database_label=f"context-graph-server:{self.db_path}",
            )

    def ingest_mcp_results(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            return self.mcp_ingester.ingest_mcp_fetch(
                self.processor,
                self.conn,
                payload,
                database_label=f"context-graph-server:{self.db_path}",
            )

    def export_graph(self, session_id: str, connector: str | None = None) -> dict[str, Any]:
        with self.lock:
            return self.exporter.export_graph_from_conn(self.conn, session_id, connector)


class ContextGraphHandler(BaseHTTPRequestHandler):
    server_version = "OpenBubbleContextGraph/0.1"

    def store(self) -> ContextGraphStore:
        return self.server.store  # type: ignore[attr-defined]

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=True, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.send_header("access-control-allow-origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, message: str, status: int = 400) -> None:
        self.send_json({"error": "bad_request", "message": message}, status)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in {"/", "/control-panel"}:
            self.send_file(CONTROL_PANEL_DIR / "index.html", head_only=True)
            return
        if parsed.path.startswith("/control-panel/"):
            relative = parsed.path.removeprefix("/control-panel/")
            self.send_file((CONTROL_PANEL_DIR / relative).resolve(), head_only=True)
            return
        self.send_response(HTTPStatus.NOT_FOUND)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/health":
                self.send_json({"ok": True, "service": "open-bubble-context-graph"})
                return
            if parsed.path == "/context-graph":
                params = parse_qs(parsed.query)
                session_id = params.get("sessionId", ["sess_test_001"])[0]
                connector = params.get("connector", [None])[0]
                self.send_json(self.store().export_graph(session_id, connector))
                return
            if parsed.path == "/context-graph/stream":
                self.stream_graph(parsed.query)
                return
            if parsed.path in {"/", "/control-panel"}:
                self.send_file(CONTROL_PANEL_DIR / "index.html")
                return
            if parsed.path.startswith("/control-panel/"):
                relative = parsed.path.removeprefix("/control-panel/")
                self.send_file((CONTROL_PANEL_DIR / relative).resolve())
                return
            self.send_error_json("Not found", HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_error_json(str(exc), HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            body = read_json_body(self)
            if parsed.path == "/ingest/context-request":
                self.send_json(self.store().ingest_context_request(body))
                return
            if parsed.path == "/ingest/mcp-results":
                self.send_json(self.store().ingest_mcp_results(body))
                return
            if parsed.path == "/seed":
                reset = bool(body.pop("reset", False))
                fixture = body.get("fixture", body)
                if not isinstance(fixture, dict):
                    raise ValueError("fixture must be a JSON object")
                self.send_json(self.store().seed(fixture, reset=reset))
                return
            self.send_error_json("Not found", HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_error_json(str(exc), HTTPStatus.BAD_REQUEST)

    def stream_graph(self, query: str) -> None:
        params = parse_qs(query)
        session_id = params.get("sessionId", ["sess_test_001"])[0]
        connector = params.get("connector", [None])[0]
        interval = float(params.get("interval", ["1.0"])[0])
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.send_header("connection", "keep-alive")
        self.send_header("access-control-allow-origin", "*")
        self.end_headers()

        previous_hash = ""
        while True:
            try:
                payload = self.store().export_graph(session_id, connector)
                data = json.dumps(payload, ensure_ascii=True, sort_keys=True)
                digest = hashlib.sha256(data.encode("utf-8")).hexdigest()
                if digest != previous_hash:
                    previous_hash = digest
                    message = f"event: graph.snapshot\ndata: {data}\n\n".encode("utf-8")
                    self.wfile.write(message)
                    self.wfile.flush()
                time.sleep(interval)
            except (BrokenPipeError, ConnectionResetError):
                return

    def send_file(self, file_path: Path, head_only: bool = False) -> None:
        resolved = file_path.resolve()
        if not str(resolved).startswith(str(CONTROL_PANEL_DIR.resolve())):
            self.send_error_json("Not found", HTTPStatus.NOT_FOUND)
            return
        if not resolved.exists() or not resolved.is_file():
            self.send_error_json("Not found", HTTPStatus.NOT_FOUND)
            return
        data = resolved.read_bytes()
        content_type = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        return


class ContextGraphHTTPServer(ThreadingHTTPServer):
    def __init__(self, server_address: tuple[str, int], store: ContextGraphStore):
        super().__init__(server_address, ContextGraphHandler)
        self.store = store


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the Open Bubble context graph over HTTP.")
    parser.add_argument("--db", default="data/context.duckdb", help="DuckDB path owned by this server.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host, or 'tailscale' to bind the Tailscale IPv4.")
    parser.add_argument("--port", type=int, default=8788, help="Bind port.")
    args = parser.parse_args()

    host = resolve_host(args.host)
    store = ContextGraphStore(Path(args.db))
    server = ContextGraphHTTPServer((host, args.port), store)
    actual_host, actual_port = server.server_address
    print(
        json.dumps(
            {
                "service": "open-bubble-context-graph",
                "url": f"http://{actual_host}:{actual_port}",
                "db": args.db,
            },
            sort_keys=True,
        ),
        flush=True,
    )
    try:
        server.serve_forever()
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
