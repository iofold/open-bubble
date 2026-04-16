# Codex Bubble API MVP Design

## Goal

Define and scaffold a very small local API server for Codex Bubble so the Android app can send screen media plus text and/or raw audio and receive a synchronous dummy text response.

## Scope

This MVP replaces the broader session/event-oriented app-server contract for now.

In scope:

- `apps/api` as the only server workspace
- TypeScript server implementation
- Fastify as the HTTP framework
- `GET /health`
- `POST /prompt`
- OpenAPI contract under `docs/api/openapi.yaml`
- Clear human-readable docs and example payloads
- Strict shared TypeScript config inside `apps/`

Out of scope:

- Authentication
- Persistence
- Sessions
- SSE or polling
- Background jobs
- Real AI integration
- Agent adapters beyond future-facing doc references

## Architecture

The server lives in `apps/api` and runs locally as a small Fastify app. It exposes two routes and returns synchronous JSON responses only.

The mobile client sends `multipart/form-data` to `POST /prompt` with one required `screenMedia` file and at least one prompt field. The prompt can be text, raw audio, or both. The server validates that the screen media is an image or video, accepts raw audio without client-side transcription, reads only the metadata needed for a dummy response, and returns a small JSON payload with a generated text answer.

OpenAPI remains the contract source of truth. The implementation should stay aligned with the spec and keep the docs short enough that a teammate can understand the whole API in one quick read.

## Route Design

### `GET /health`

Purpose:

- Confirm the local API server is reachable

Response:

- `200 OK`
- JSON body with status metadata suitable for quick local checks

Example shape:

```json
{
  "status": "ok",
  "service": "codex-bubble-api"
}
```

### `POST /prompt`

Purpose:

- Accept one prompt request from the mobile app
- Support either image or video upload for the MVP
- Return a synchronous dummy answer as JSON

Request:

- Content type: `multipart/form-data`
- Required field: `screenMedia`
- Optional field: `promptText`
- Optional field: `promptAudio`

Media rules:

- Accept `image/*` and `video/*`
- Accept raw `audio/*` in `promptAudio` without client-side transcription
- Reject unsupported media types
- No authentication
- No persistence

Response:

- `200 OK` on success
- JSON response with:
  - dummy answer text
  - echoed prompt text when provided
  - prompt audio metadata when provided
  - screen media filename when available
  - screen media MIME type
  - coarse media category (`image` or `video`)

Error cases:

- `400 Bad Request` when the upload is missing or malformed
- `415 Unsupported Media Type` when the uploaded file is not an image or video

## Documentation Changes

The repo docs should be simplified to match the trimmed MVP:

- Replace `docs/api/openapi.yaml` with a new two-route contract
- Remove the old event-contract content from active MVP guidance
- Rewrite `docs/specs/server.md` around the new local API shape
- Update top-level `AGENTS.md` to point app-server work to `apps/api` and require TypeScript there
- Keep example payloads in `docs/api/examples/` limited to the new MVP flow

The docs should explain the API at a high level first, then show the concrete request/response contract and example usage.

## Project Structure

```text
apps/
  api/
    src/
      app.ts
      server.ts
      routes/
        health.ts
        prompt.ts
      schemas/
        prompt.ts
  mobile/
  agent-adapters/
  tsconfig.base.json
docs/
  api/
    openapi.yaml
    examples/
      prompt-response.json
  specs/
    server.md
```

## TypeScript Rules

TypeScript should be strict and boring:

- strict mode enabled
- no implicit any
- no unsafe loose config
- no `any`
- no `unknown`
- prefer small explicit interfaces/types where needed
- avoid overengineering the type model

The implementation should use concrete route-local types and small helper types instead of large abstractions.

## Validation and Behavior

The server should:

- reject requests that do not include a file
- reject unsupported file types
- accept empty or missing prompt text
- return predictable dummy text without calling external services
- expose Swagger/OpenAPI documentation locally for easy teammate use

Dummy answer behavior should stay simple. For example, the response can mention whether the media was an image or video and include the prompt text if one was provided.

## Verification

Required verification for this scope:

- validate `docs/api/openapi.yaml`
- validate JSON examples parse
- run `git diff --check`
- run TypeScript typecheck for `apps/api`
- start the Fastify server locally and verify `GET /health`

## Implementation Notes

Fastify is the preferred framework because it is lightweight, TypeScript-friendly, and still leaves room to add SSE support in a future iteration if the product grows into streaming events.

This MVP should avoid adding more architecture than the current demo needs. The simplest successful version is the right version.
