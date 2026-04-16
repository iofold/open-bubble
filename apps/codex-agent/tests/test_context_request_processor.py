from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import duckdb


AGENT_DIR = Path(__file__).resolve().parents[1]
SEED_SCRIPT = AGENT_DIR / "scripts" / "seed-context-graph.py"
PROCESS_SCRIPT = AGENT_DIR / "scripts" / "process-context-request.py"
TESTDATA = AGENT_DIR / "testdata"
SCHEMAS = AGENT_DIR / "schemas"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


REQUEST_ENUMS = {
    ("intent",): {"context_question", "code_assertion"},
    ("screenshot", "mimeType"): {"image/png", "image/jpeg", "image/webp"},
    ("prompt", "audioMimeType"): {"audio/aac", "audio/m4a", "audio/mp4", "audio/wav", "audio/webm"},
}

ANSWER_ENUMS = {
    ("confidence",): {"low", "medium", "high"},
    ("retrievalMode",): {"session_state", "direct_duckdb", "local_files", "agent_reasoning", "mixed"},
}


def get_nested(payload: dict, path: tuple[str, ...]) -> object:
    current: object = payload
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def assert_request_schema_subset(test: unittest.TestCase, payload: dict) -> None:
    schema = load_json(SCHEMAS / "context-request.schema.json")
    for key in schema["required"]:
        test.assertIn(key, payload)
    test.assertIsInstance(payload["deviceId"], str)
    test.assertIsInstance(payload["screenshot"], dict)
    test.assertIsInstance(payload["prompt"], dict)
    for path, allowed in REQUEST_ENUMS.items():
        value = get_nested(payload, path)
        if value is not None:
            test.assertIn(value, allowed)


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


def assert_context_answer_shape(test: unittest.TestCase, answer: dict) -> None:
    schema = load_json(SCHEMAS / "context-answer.schema.json")
    for key in schema["required"]:
        test.assertIn(key, answer)
    test.assertIsInstance(answer.get("summary"), str)
    test.assertTrue(answer["summary"].strip())
    for path, allowed in ANSWER_ENUMS.items():
        test.assertIn(get_nested(answer, path), allowed)
    test.assertIsInstance(answer.get("localContextUsed"), list)


class ContextRequestProcessorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = str(Path(self.tmp.name) / "context.duckdb")

    def seed(self) -> dict:
        return run_json(
            [
                str(SEED_SCRIPT),
                "--db",
                self.db_path,
                "--fixture",
                str(TESTDATA / "seed-context.json"),
                "--reset",
            ]
        )

    def process(self, fixture_name: str) -> tuple[dict, dict]:
        response_path = Path(self.tmp.name) / f"{fixture_name}.response.json"
        report = run_json(
            [str(PROCESS_SCRIPT), "--answer-only"],
            env={
                "OPEN_BUBBLE_CONTEXT_DB": self.db_path,
                "OPEN_BUBBLE_CONTEXT_REQUEST_FILE": str(TESTDATA / fixture_name),
                "OPEN_BUBBLE_RESPONSE_FILE": str(response_path),
            },
        )
        answer = json.loads(response_path.read_text())
        return report, answer

    def scalar(self, sql: str) -> int:
        conn = duckdb.connect(self.db_path)
        try:
            return int(conn.execute(sql).fetchone()[0])
        finally:
            conn.close()

    def test_seed_context_graph_injects_ontology_tables(self) -> None:
        seeded = self.seed()

        self.assertEqual(seeded["sessionId"], "sess_test_001")
        self.assertEqual(seeded["episodes"], 1)
        self.assertGreaterEqual(self.scalar("SELECT COUNT(*) FROM graph_episodes"), 1)
        self.assertGreaterEqual(self.scalar("SELECT COUNT(*) FROM graph_entities"), 4)
        self.assertGreaterEqual(self.scalar("SELECT COUNT(*) FROM graph_relations"), 3)
        self.assertGreaterEqual(self.scalar("SELECT COUNT(*) FROM context_chunks"), 2)

    def test_request_fixtures_match_schema_subset(self) -> None:
        for fixture_name in [
            "request-fetch-response.json",
            "request-ingest-only.json",
            "request-code-assertion.json",
        ]:
            with self.subTest(fixture=fixture_name):
                assert_request_schema_subset(self, load_json(TESTDATA / fixture_name))

    def test_fetch_response_ingests_request_and_answers_from_seed_context(self) -> None:
        self.seed()
        report, answer = self.process("request-fetch-response.json")

        self.assertEqual(report["classifiedIntent"], "fetch_response")
        self.assertTrue(report["answerProduced"])
        assert_context_answer_shape(self, answer)
        self.assertIn("context graph", answer["summary"].lower())
        self.assertNotIn("codeAssertionResult", answer)
        self.assertGreaterEqual(self.scalar("SELECT COUNT(*) FROM context_requests"), 1)
        self.assertGreaterEqual(
            self.scalar("SELECT COUNT(*) FROM graph_episodes WHERE type = 'frontend_context_request'"),
            1,
        )
        self.assertGreaterEqual(
            self.scalar("SELECT COUNT(*) FROM graph_relations WHERE source_episode_id IS NOT NULL"),
            1,
        )

    def test_reprocessing_same_request_is_idempotent_for_keyed_records(self) -> None:
        self.seed()
        self.process("request-fetch-response.json")
        counts_after_first = {
            "requests": self.scalar("SELECT COUNT(*) FROM context_requests"),
            "chunks": self.scalar("SELECT COUNT(*) FROM context_chunks"),
            "episodes": self.scalar("SELECT COUNT(*) FROM graph_episodes"),
        }

        self.process("request-fetch-response.json")

        self.assertEqual(counts_after_first["requests"], self.scalar("SELECT COUNT(*) FROM context_requests"))
        self.assertEqual(counts_after_first["chunks"], self.scalar("SELECT COUNT(*) FROM context_chunks"))
        self.assertEqual(counts_after_first["episodes"], self.scalar("SELECT COUNT(*) FROM graph_episodes"))

    def test_ingest_only_stores_context_without_answering_in_report(self) -> None:
        self.seed()
        report, answer = self.process("request-ingest-only.json")

        self.assertEqual(report["classifiedIntent"], "ingest_only")
        self.assertFalse(report["answerProduced"])
        assert_context_answer_shape(self, answer)
        self.assertIn("ingest-only", answer.get("details", ""))
        self.assertGreaterEqual(self.scalar("SELECT COUNT(*) FROM context_requests"), 1)

    def test_code_assertion_returns_structured_assertion_result(self) -> None:
        self.seed()
        report, answer = self.process("request-code-assertion.json")

        self.assertEqual(report["classifiedIntent"], "code_assertion")
        self.assertTrue(report["answerProduced"])
        assert_context_answer_shape(self, answer)
        self.assertIn("codeAssertionResult", answer)
        self.assertEqual(answer["codeAssertionResult"]["verdict"], "inconclusive")
        self.assertIsInstance(answer["codeAssertionResult"]["evidence"], list)

    def test_string_false_assertion_flag_does_not_trigger_code_assertion(self) -> None:
        self.seed()
        response_path = Path(self.tmp.name) / "string_false.response.json"
        request = load_json(TESTDATA / "request-code-assertion.json")
        request["id"] = "ctx_req_assert_string_false"
        request["userExplicitlyRequestedCodeAssertion"] = "false"
        report = run_json(
            [str(PROCESS_SCRIPT), "--answer-only"],
            env={
                "OPEN_BUBBLE_CONTEXT_DB": self.db_path,
                "OPEN_BUBBLE_CONTEXT_REQUEST": json.dumps(request),
                "OPEN_BUBBLE_RESPONSE_FILE": str(response_path),
            },
        )
        answer = json.loads(response_path.read_text())

        self.assertNotEqual(report["classifiedIntent"], "code_assertion")
        self.assertNotIn("codeAssertionResult", answer)
        assert_context_answer_shape(self, answer)


if __name__ == "__main__":
    unittest.main()
