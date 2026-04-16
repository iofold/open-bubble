---
name: open-bubble-ingest-request
description: Ingest an Open Bubble screenshot plus voice-note context request through the Fastify API graph endpoint.
---

# Open Bubble Ingest Request

## Use This When

The App Server spawned Codex to process an incoming frontend context request that includes screenshot metadata/image data and an audio transcript or typed fallback.

## Fast Path

Post the request JSON to:

```text
POST /context-graph/ingest/context-request
```

The API stores the raw episode, request, screenshot, voice note, graph entities, provenance fact edges, and searchable chunks. If the classified intent asks for a response, the API response includes a graph-backed answer.

## Intent Rules

- `code_assertion`: only when request intent is `code_assertion` and `userExplicitlyRequestedCodeAssertion` is true.
- `fetch_response`: question words, `?`, "answer", "respond", "summarize", "explain", "next", or the normal `context_question` intent.
- `ingest_only`: "remember", "save", "store", "capture", "record", "note", or no transcript.

## Output

Write the answer JSON to `OPEN_BUBBLE_RESPONSE_FILE` when set. Otherwise print JSON to stdout.
