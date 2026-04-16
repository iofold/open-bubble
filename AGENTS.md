# AGENTS.md — Open Bubble repo guidance

Open Bubble is in a docs-first MVP phase. Keep the active story focused on the local API in `apps/api`, and do not expand behavior beyond the current contract unless the docs change first.

## Source of truth

- REST/API contract: `docs/api/openapi.yaml`
- API examples: `docs/api/examples/`
- API/server notes: `docs/specs/server.md`
- MVP scope: `docs/specs/product-scope.md`
- Current system understanding: `docs/specs/application-understanding.md`
- MCP connector boundaries: `docs/specs/mcp-connectors.md`
- Graph control panel plan: `docs/specs/graph-control-panel.md`

## Layout

```text
apps/
  api/             Fastify API MVP
  mobile/          Flutter Android app placeholder
  codex-agent/     Codex agent workspace for context graph experiments
docs/
  api/             OpenAPI contract and examples
  guides/          Local workflow guides
  specs/           Short MVP notes
  adr/             Architecture decisions
```

## Rules

### One-command API tunnel

- Run `./scripts/start-api-ngrok.sh` from the repo root when the frontend needs a reachable API server.
- The command starts `apps/api`, exposes it through `ngrok`, prints the public URL, and syncs that URL into the repo-level `.env` as `OPEN_BUBBLE_API_BASE_URL`.
- Keep existing `.env` entries intact; the launcher should update only the managed API base URL key.
- Frontend integration details live in `docs/guides/frontend-api-server.md`.

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
- `POST /prompt` uses multipart/form-data with required `screenMedia`, optional `promptText`, optional raw `promptAudio`, and at least one prompt field.
- Keep docs brief and prefer removing stale scope over documenting old flows as active behavior.
- Update the API contract before changing API behavior.

### Codex Agent Workspace (`apps/codex-agent/`)

- This directory is the intended local workspace for Codex-agent context graph experiments and future API/App Server integration.
- Keep runnable agent instructions in `apps/codex-agent/AGENTS.md`.
- Put local Codex-compatible skills under `apps/codex-agent/.agents/skills/`.
- Keep helper scripts lightweight and dependency-free unless a dependency is documented in this directory.
- Runtime request/response payloads and local DuckDB files should stay ignored.
- Gmail, Google Drive, and Google Calendar access should go through local Codex/App Server MCP connectors and be ingested into the context graph; the Flutter app should not call those providers directly.
- Do not assume `apps/api` dispatch behavior from this workspace; expose file/JSON handoffs that API work can call later.

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
- Codex agent: run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v` from `apps/codex-agent`.

## Commit guidance

Use concise commits that explain why the change exists. If a commit changes contracts or architecture, mention what was tested and what remains untested in the commit body.
