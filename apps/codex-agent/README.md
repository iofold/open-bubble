# Open Bubble Codex Agent Workspace

This directory is the planned `cwd` for Codex agents spawned by the Open Bubble App Server.

The directory is intentionally simple: local instructions, local skills, request/response handoff folders, and helper scripts for direct DuckDB context reads. The App Server can launch Codex here and pass a context request by environment variable or JSON file.

## Expected launch shape

```bash
cd apps/codex-agent
OPEN_BUBBLE_CONTEXT_REQUEST_FILE=/tmp/open-bubble/request.json \
OPEN_BUBBLE_RESPONSE_FILE=/tmp/open-bubble/response.json \
OPEN_BUBBLE_CONTEXT_DB=/path/to/context.duckdb \
codex
```

The exact App Server command can change when implementation starts. The stable contract is the environment variables documented in `AGENTS.md`.

For the current MVP script path:

```bash
cd apps/codex-agent
OPEN_BUBBLE_CONTEXT_REQUEST_FILE=../../docs/api/examples/context-request.json \
OPEN_BUBBLE_RESPONSE_FILE=/tmp/open-bubble-response.json \
./scripts/process-context-request.py --answer-only
```

This ingests the screenshot metadata and prompt transcript into `data/context.duckdb`, classifies the voice prompt intent, queries the graph when a response is requested, and writes a `ContextAnswer` JSON object.

## Test Data

Seed deterministic graph context:

```bash
./scripts/seed-context-graph.py --db /tmp/open-bubble-context.duckdb --reset
```

Run the local processor tests:

```bash
python3 -m unittest discover -s tests
```

## Layout

```text
apps/codex-agent/
  AGENTS.md
  .agents/skills/
  references/
  schemas/
  testdata/
  tests/
  requests/
  responses/
  scripts/
```

Runtime payloads in `requests/`, `responses/`, and `data/` are ignored except for `.gitkeep` files.
