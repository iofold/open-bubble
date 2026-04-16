# AGENTS.md — Open Bubble repo guidance

Open Bubble is in a docs-first MVP phase. Keep the active story focused on the local API in `apps/api`, the local Codex bridge in `apps/codex-app-server`, and the existing `apps/codex-agent` workspace. Do not expand behavior beyond the current contract unless the docs change first.

## Source of truth

- `docs/api/openapi.yaml`
- `docs/api/examples/`
- `docs/specs/server.md`

## Layout

```text
apps/
  api/             Fastify API MVP
  codex-agent/     Local Codex agent assets and scripts
  codex-app-server/ TypeScript bridge to the local Codex App Server
  mobile/          Flutter Android app placeholder
docs/
  api/             OpenAPI contract and examples
  specs/           Short MVP notes
```

## Rules

### Mobile / Flutter (`apps/mobile/`)

- Flutter is the primary mobile framework.
- Android is the only MVP platform target for now.
- Keep normal app UI and state in Flutter/Dart.
- Keep Android-only functionality behind narrow platform channels:
  - overlay / floating bubble
  - foreground service
  - notification permission + notification display
  - MediaProjection screenshot capture
- For the current API MVP, mobile should submit `screenMedia` plus at least one of `promptText` or raw `promptAudio`.
- The frontend must not transcribe `promptAudio`; send the bytes as-is.

### API (`apps/api/`)

- Keep Node.js, TypeScript, build, and test tooling inside `apps/api/`.
- Use strict TypeScript for the API MVP.
- Keep the active API limited to `GET /health` and `POST /prompt` until the contract is updated.
- `POST /prompt` uses multipart/form-data with required screenshot-style `screenMedia` and required `promptText`.
- The API should call into `apps/codex-app-server` and wait for the local Codex run to finish before returning.
- Keep docs brief and prefer removing stale scope over documenting old flows as active behavior.
- Update the API contract before changing API behavior.

### Codex App Server (`apps/codex-app-server/`)

- Keep Node.js, TypeScript, build, and test tooling inside `apps/codex-app-server/`.
- This package owns the local `codex app-server` JSON-RPC integration, repo inference config, and orchestration.
- Generate Codex App Server TypeScript bindings and JSON schema inside `apps/codex-app-server/generated/`.
- Files under `apps/codex-app-server/generated/` are auto-generated. Do not edit them manually; regenerate them instead.
- Keep the bridge local-first and synchronous for the current demo path: infer repo -> start turn -> wait for completion -> return PR metadata.

## Contract-change rule

When changing API behavior:

1. Update `docs/api/openapi.yaml` first.
2. Update sample payloads in `docs/api/examples/`.
3. Update affected specs or demo steps.
4. Then implement code in the relevant app directory.

## Git sync rule

Before starting any new task, pull the latest remote state first:

```bash
git pull --ff-only
```

If the working tree is dirty, finish/commit/stash the current work before pulling. Do not start implementation or docs edits from a stale branch. If `git pull --ff-only` fails because histories diverged, stop and resolve the branch state before continuing.

## Collaboration rules

- Keep PRs small and lane-specific when possible.
- Avoid broad rewrites during the hackathon.
- Prefer adding TODOs to docs over guessing hidden requirements.
- Record meaningful architecture decisions in `docs/adr/`.
- Do not commit `.omx/`, local secrets, keystores, build outputs, or generated dependency directories.
- No new dependencies without a clear reason documented in the relevant README/spec.

## Verification expectations

For docs-only changes:

- Validate JSON examples parse.
- Validate OpenAPI YAML parses if touched.
- Run `git diff --check`.

For later implementation changes:

- Mobile: run Flutter format/analyze/tests once the Flutter project exists.
- API: run `apps/api` tests, typecheck, and build once the workspace exists.

## Commit guidance

Use concise commits that explain why the change exists. If a commit changes contracts or architecture, mention what was tested and what remains untested in the commit body.
