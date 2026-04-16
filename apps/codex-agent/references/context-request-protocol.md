# Context Request Protocol

The App Server sends a context request when the phone user asks a screenshot + audio/typed question.

## Input Sources

Check these in order:

1. `OPEN_BUBBLE_CONTEXT_REQUEST` for inline JSON.
2. `OPEN_BUBBLE_CONTEXT_REQUEST_FILE` for a JSON file.
3. `requests/latest.json` for local manual testing.

## Important Request Fields

- `deviceId`: phone/device id.
- `createdAt`: request timestamp.
- `intent`: `context_question` or `code_assertion`.
- `userExplicitlyRequestedCodeAssertion`: must be true before producing code assertion output.
- `screenshot.screenMetadata`: visible app/text metadata when image bytes are absent.
- `prompt.transcript`: primary user question.
- `localContextHints.workingDirectory`: project directory the answer should inspect.
- `localContextHints.files`: files the frontend/server thinks may matter.

## Output

Write a single JSON object matching `ContextAnswer`.

Use `summary` for the bubble-sized answer. Use `details` for supporting context and uncertainty.

Schemas:

- `schemas/context-request.schema.json`
- `schemas/context-answer.schema.json`
