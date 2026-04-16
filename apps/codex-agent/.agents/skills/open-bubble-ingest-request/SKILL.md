---
name: open-bubble-ingest-request
description: Ingest an Open Bubble screenshot plus voice-note context request into the local DuckDB context graph, classify whether the voice prompt asks for a response, and produce a ContextAnswer when requested.
---

# Open Bubble Ingest Request

## Use This When

The App Server spawned Codex to process an incoming frontend context request that includes screenshot metadata/image data and an audio transcript or typed voice-note fallback.

## Fast Path

Run:

```bash
./scripts/process-context-request.py --answer-only
```

The script:

1. Loads the request from `OPEN_BUBBLE_CONTEXT_REQUEST`, `OPEN_BUBBLE_CONTEXT_REQUEST_FILE`, or `requests/latest.json`.
2. Analyzes screenshot metadata/image presence.
3. Analyzes the voice transcript for keywords and intent.
4. Creates or updates `data/context.duckdb` unless `OPEN_BUBBLE_CONTEXT_DB` points elsewhere.
5. Stores the raw episode, request, screenshot, voice note, graph entities, temporal/provenance fact edges, and searchable chunks.
6. If the classified intent is `fetch_response` or `code_assertion`, queries the context graph and emits a `ContextAnswer`.

## Intent Rules

- `code_assertion`: only when request intent is `code_assertion` and `userExplicitlyRequestedCodeAssertion` is true.
- `fetch_response`: question words, `?`, "answer", "respond", "summarize", "explain", "next", or the normal `context_question` intent.
- `ingest_only`: "remember", "save", "store", "capture", "record", "note", or no transcript.

## Output

When `OPEN_BUBBLE_RESPONSE_FILE` is set, write the answer JSON there. The script also prints an ingest report to stdout for logs.

## Test Fixtures

Use `testdata/seed-context.json` to preload deterministic graph context, then process one of:

- `testdata/request-fetch-response.json`
- `testdata/request-ingest-only.json`
- `testdata/request-code-assertion.json`
