from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
import urllib.request
from pathlib import Path

import duckdb


AGENT_DIR = Path(__file__).resolve().parents[1]
SEED_SCRIPT = AGENT_DIR / "scripts" / "seed-context-graph.py"
INGEST_MCP_SCRIPT = AGENT_DIR / "scripts" / "ingest-mcp-results.py"
EXPORT_SCRIPT = AGENT_DIR / "scripts" / "export-context-graph.py"
PROCESS_SCRIPT = AGENT_DIR / "scripts" / "process-context-request.py"
SERVER_SCRIPT = AGENT_DIR / "scripts" / "context-graph-server.py"
TESTDATA = AGENT_DIR / "testdata"
SCHEMAS = AGENT_DIR / "schemas"


def run_json(command: list[str], env: dict[str, str] | None = None) -> dict:
    result = subprocess.run(
        command,
        cwd=AGENT_DIR,
        env={**os.environ, **(env or {})},
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


class McpConnectorGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = str(Path(self.tmp.name) / "context.duckdb")
        run_json(
            [
                str(SEED_SCRIPT),
                "--db",
                self.db_path,
                "--fixture",
                str(TESTDATA / "seed-context.json"),
                "--reset",
            ]
        )

    def ingest(self, fixture_name: str) -> dict:
        return run_json(
            [
                str(INGEST_MCP_SCRIPT),
                "--db",
                self.db_path,
                "--input",
                str(TESTDATA / fixture_name),
            ]
        )

    def query(self, sql: str) -> list[tuple]:
        conn = duckdb.connect(self.db_path)
        try:
            return conn.execute(sql).fetchall()
        finally:
            conn.close()

    def scalar(self, sql: str) -> int:
        return int(self.query(sql)[0][0])

    def test_mcp_fixtures_match_schema_subset(self) -> None:
        schema = load_json(SCHEMAS / "mcp-fetch-result.schema.json")
        allowed = set(schema["properties"]["connector"]["enum"])
        for fixture_name in [
            "mcp-gmail-results.json",
            "mcp-drive-results.json",
            "mcp-calendar-results.json",
        ]:
            with self.subTest(fixture=fixture_name):
                payload = load_json(TESTDATA / fixture_name)
                for key in schema["required"]:
                    self.assertIn(key, payload)
                self.assertIn(payload["connector"], allowed)
                self.assertIsInstance(payload["results"], list)

    def test_ingests_gmail_drive_and_calendar_connector_fixtures(self) -> None:
        reports = [
            self.ingest("mcp-gmail-results.json"),
            self.ingest("mcp-drive-results.json"),
            self.ingest("mcp-calendar-results.json"),
        ]

        self.assertEqual([report["connector"] for report in reports], ["gmail", "drive", "calendar"])
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM graph_episodes WHERE type LIKE 'mcp_%'"), 3)
        for entity_type in [
            "gmail_thread",
            "gmail_message",
            "drive_file",
            "drive_folder",
            "document_section",
            "calendar_event",
            "person",
            "attachment",
            "location",
        ]:
            with self.subTest(entity_type=entity_type):
                self.assertGreaterEqual(
                    self.scalar(f"SELECT COUNT(*) FROM graph_entities WHERE type = '{entity_type}'"),
                    1,
                )
        for relation_type in [
            "sent_by",
            "sent_to",
            "part_of_thread",
            "has_attachment",
            "owned_by",
            "shared_with",
            "contained_in",
            "attended_by",
            "scheduled_with",
            "scheduled_at",
            "mentions",
            "derived_from_mcp",
        ]:
            with self.subTest(relation_type=relation_type):
                self.assertGreaterEqual(
                    self.scalar(f"SELECT COUNT(*) FROM graph_relations WHERE type = '{relation_type}'"),
                    1,
                )
        self.assertEqual(
            self.scalar(
                "SELECT COUNT(*) FROM graph_relations WHERE type IN ('sent_by','owned_by','attended_by','derived_from_mcp') AND source_episode_id IS NULL"
            ),
            0,
        )

    def test_mcp_ingestion_is_idempotent_for_same_fixture(self) -> None:
        self.ingest("mcp-gmail-results.json")
        counts = {
            "episodes": self.scalar("SELECT COUNT(*) FROM graph_episodes"),
            "entities": self.scalar("SELECT COUNT(*) FROM graph_entities"),
            "relations": self.scalar("SELECT COUNT(*) FROM graph_relations"),
            "chunks": self.scalar("SELECT COUNT(*) FROM context_chunks"),
        }
        self.ingest("mcp-gmail-results.json")
        self.assertEqual(counts["episodes"], self.scalar("SELECT COUNT(*) FROM graph_episodes"))
        self.assertEqual(counts["entities"], self.scalar("SELECT COUNT(*) FROM graph_entities"))
        self.assertEqual(counts["relations"], self.scalar("SELECT COUNT(*) FROM graph_relations"))
        self.assertEqual(counts["chunks"], self.scalar("SELECT COUNT(*) FROM context_chunks"))

    def test_graph_export_has_control_panel_shape_and_provenance(self) -> None:
        self.ingest("mcp-gmail-results.json")
        self.ingest("mcp-drive-results.json")
        self.ingest("mcp-calendar-results.json")
        export = run_json(
            [
                str(EXPORT_SCRIPT),
                "--db",
                self.db_path,
                "--session-id",
                "sess_test_001",
            ]
        )
        export_schema = load_json(SCHEMAS / "context-graph-export.schema.json")
        for key in export_schema["required"]:
            self.assertIn(key, export)
        self.assertEqual(export["sessionId"], "sess_test_001")
        self.assertGreaterEqual(export["stats"]["episodeCount"], 4)
        self.assertGreaterEqual(export["stats"]["nodeCount"], 10)
        self.assertGreaterEqual(export["stats"]["edgeCount"], 10)
        self.assertTrue(any(edge.get("sourceEpisodeId") for edge in export["edges"]))
        self.assertIn("gmail", export["stats"]["connectorCounts"])
        self.assertIn("drive", export["stats"]["connectorCounts"])
        self.assertIn("calendar", export["stats"]["connectorCounts"])

    def test_mcp_chunks_can_be_used_in_context_answer(self) -> None:
        self.ingest("mcp-gmail-results.json")
        response_path = Path(self.tmp.name) / "response.json"
        request = {
            "id": "ctx_req_email_followup",
            "sessionId": "sess_test_001",
            "deviceId": "android_test_device",
            "createdAt": "2026-04-16T08:05:00Z",
            "intent": "context_question",
            "screenshot": {
                "capturedAt": "2026-04-16T08:04:58Z",
                "screenMetadata": {"visibleText": "Email follow-up"},
            },
            "prompt": {
                "capturedAt": "2026-04-16T08:04:59Z",
                "transcript": "What did the email say about connector snippets?",
                "language": "en-US",
            },
        }
        report = run_json(
            [str(PROCESS_SCRIPT), "--answer-only"],
            env={
                "OPEN_BUBBLE_CONTEXT_DB": self.db_path,
                "OPEN_BUBBLE_CONTEXT_REQUEST": json.dumps(request),
                "OPEN_BUBBLE_RESPONSE_FILE": str(response_path),
            },
        )
        answer = json.loads(response_path.read_text())

        self.assertTrue(report["answerProduced"])
        self.assertIn("mcp:gmail", answer["localContextUsed"])
        self.assertIn("connector snippets", answer["summary"].lower())

    def test_scripts_can_write_through_context_graph_server(self) -> None:
        server_db = str(Path(self.tmp.name) / "server-context.duckdb")
        server = subprocess.Popen(
            [str(SERVER_SCRIPT), "--db", server_db, "--host", "127.0.0.1", "--port", "0"],
            cwd=AGENT_DIR,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        def stop_server() -> None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
            if server.stdout:
                server.stdout.close()
            if server.stderr:
                server.stderr.close()

        self.addCleanup(stop_server)
        assert server.stdout is not None
        startup = json.loads(server.stdout.readline())
        server_url = startup["url"]

        run_json(
            [
                str(SEED_SCRIPT),
                "--db",
                server_db,
                "--fixture",
                str(TESTDATA / "seed-context.json"),
                "--reset",
            ],
            env={"OPEN_BUBBLE_CONTEXT_GRAPH_URL": server_url},
        )
        run_json(
            [
                str(INGEST_MCP_SCRIPT),
                "--db",
                server_db,
                "--input",
                str(TESTDATA / "mcp-gmail-results.json"),
            ],
            env={"OPEN_BUBBLE_CONTEXT_GRAPH_URL": server_url},
        )
        response_path = Path(self.tmp.name) / "server-answer.json"
        request = {
            "id": "ctx_req_server_001",
            "sessionId": "sess_test_001",
            "deviceId": "android_test_device",
            "createdAt": "2026-04-16T08:15:00Z",
            "intent": "context_question",
            "screenshot": {
                "capturedAt": "2026-04-16T08:14:58Z",
                "screenMetadata": {"visibleText": "Email follow-up"},
            },
            "prompt": {
                "capturedAt": "2026-04-16T08:14:59Z",
                "transcript": "What did the email say about connector snippets?",
                "language": "en-US",
            },
        }
        run_json(
            [str(PROCESS_SCRIPT), "--answer-only"],
            env={
                "OPEN_BUBBLE_CONTEXT_GRAPH_URL": server_url,
                "OPEN_BUBBLE_CONTEXT_DB": server_db,
                "OPEN_BUBBLE_CONTEXT_REQUEST": json.dumps(request),
                "OPEN_BUBBLE_RESPONSE_FILE": str(response_path),
            },
        )
        answer = json.loads(response_path.read_text())
        self.assertIn("mcp:gmail", answer["localContextUsed"])

        with urllib.request.urlopen(f"{server_url}/context-graph?sessionId=sess_test_001", timeout=10) as response:
            graph = json.loads(response.read().decode("utf-8"))
        self.assertGreaterEqual(graph["stats"]["nodeCount"], 1)
        self.assertGreaterEqual(graph["stats"]["episodeCount"], 1)


if __name__ == "__main__":
    unittest.main()
