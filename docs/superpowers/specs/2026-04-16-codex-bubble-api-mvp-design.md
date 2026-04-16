# Codex Bubble API + Codex App Server MVP Design

## Goal

Define and scaffold a very small local API server plus Codex App Server bridge for Codex Bubble so the Android app can send a screenshot plus text prompt and receive a synchronous Codex-backed result with PR metadata.

## Scope

This MVP keeps the frontend surface small while using the local Codex App Server behind the API.

In scope:

- `apps/api` as the HTTP entrypoint
- `apps/codex-app-server` as the Codex App Server bridge
- TypeScript server implementation
- Fastify as the HTTP framework for `apps/api`
- `GET /health`
- `POST /prompt`
- OpenAPI contract under `docs/api/openapi.yaml`
- Clear human-readable docs and example payloads
- Generated Codex App Server bindings under `apps/codex-app-server/generated/`
- Strict shared TypeScript config inside `apps/`

Out of scope:

- Authentication
- Persistence
- Sessions beyond the local Codex thread started for the request
- SSE or polling at the API boundary
- Background jobs
- Video preprocessing
- Agent adapters beyond future-facing doc references

## Architecture

The HTTP server lives in `apps/api` and runs locally as a small Fastify app. It exposes two routes and returns synchronous JSON responses only.

The mobile client sends `multipart/form-data` to `POST /prompt` with one required screenshot file and one required text prompt. The API validates the request, stores the screenshot in a temporary local path, then calls a service from `apps/codex-app-server`.

The Codex App Server bridge resolves a repo from local config, starts or reuses a local `codex app-server` process, creates a thread in the inferred repo `cwd`, submits the screenshot and text prompt, waits for completion events, and extracts the final answer plus PR metadata. The API returns that result synchronously.

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
- Support image upload for the active MVP
- Return a synchronous Codex-backed answer as JSON

Request:

- Content type: `multipart/form-data`
- Required field: `screenMedia`
- Required field: `promptText`

Media rules:

- Accept `image/*`
- Reject unsupported media types
- No authentication
- No persistence

Response:

- `200 OK` on success
- JSON response with:
  - answer summary from Codex
  - inferred repo id
  - Codex thread id
  - branch name
  - PR URL
  - screen media filename when available
  - screen media MIME type
  - coarse media category (`image`)

Error cases:

- `400 Bad Request` when the upload is missing or malformed
- `415 Unsupported Media Type` when the uploaded file is not an image

## Documentation Changes

The repo docs should be simplified to match the active MVP:

- Replace `docs/api/openapi.yaml` with the new two-route screenshot + prompt contract
- Rewrite `docs/specs/server.md` around the local API -> Codex App Server shape
- Update top-level `AGENTS.md` to point app-server work to `apps/api` and `apps/codex-app-server`
- Add a generated-files rule for Codex App Server bindings
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
  codex-app-server/
    src/
      config.ts
      infer.ts
      service.ts
      transport.ts
    generated/
      codex-app-server/
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
- reject missing or empty prompt text
- return predictable structured Codex result data
- expose Swagger/OpenAPI documentation locally for easy teammate use

Repo inference should stay simple. A local config file can provide repo ids, cwd values, alias lists, and a default repo fallback for the demo.

## Verification

Required verification for this scope:

- validate `docs/api/openapi.yaml`
- validate JSON examples parse
- run `git diff --check`
- run TypeScript typecheck for `apps/api`
- run TypeScript tests and typecheck for `apps/codex-app-server`
- start the Fastify server locally and verify `GET /health`

## Implementation Notes

Fastify is the preferred framework because it is lightweight, TypeScript-friendly, and still leaves room to add SSE support in a future iteration if the product grows into streaming events.

This MVP should avoid adding more architecture than the current demo needs. The simplest successful version is the right version.
