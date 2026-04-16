# AGENTS.md — Open Bubble repo guidance

This file gives coding agents and human teammates the shared operating rules for the Open Bubble repository. It applies to every file in this repo unless a deeper `AGENTS.md` is added later.

## Project intent

Open Bubble is a hackathon prototype for a Flutter-first Android companion bubble. The mobile app should help a user see running backend agent sessions, send screenshot + audio prompts to be answered from local directory context, optionally request explicit outgoing code assertions, and receive answers/status/completion notifications through a bubble-style UI.

## Current phase

We are in a docs-first scaffold phase. Prefer contract/spec updates before implementation. Do not add substantial app/server code until the relevant spec and API contract are updated.

## Source-of-truth docs

- Product boundaries: `docs/specs/product-scope.md`
- Present system understanding: `docs/specs/application-understanding.md`
- User journeys: `docs/specs/user-journeys.md`
- Team workstreams: `docs/specs/team-collaboration.md`
- REST contract: `docs/api/openapi.yaml`
- Event contract: `docs/api/events.md`
- Demo script: `docs/specs/demo-plan.md`
- Architecture decisions: `docs/adr/`

## Repository layout

```text
apps/
  mobile/          Flutter Android app placeholder
  server/          App Server placeholder
  agent-adapters/  Backend/Codex-agent adapter placeholder
  codex-agent/     Codex agent workspace spawned by App Server
docs/
  api/             OpenAPI, event contracts, sample payloads
  specs/           Product, implementation, user journey, and collaboration specs
  adr/             Architecture decision records
.github/           PR and collaboration hygiene
```

## Workstream boundaries

### Mobile / Flutter (`apps/mobile/`)

- Flutter is the primary mobile framework.
- Android is the only MVP platform target for now.
- Keep normal app UI and state in Flutter/Dart.
- Keep Android-only functionality behind narrow platform channels:
  - overlay / floating bubble
  - foreground service
  - notification permission + notification display
  - MediaProjection screenshot capture
  - audio prompt capture or transcript fallback
- If native overlay/screenshot/audio work is blocked, preserve the demo path with an in-app floating bubble plus sample screenshot/transcript fallback.

### App Server (`apps/server/`)

- The API contract is `docs/api/openapi.yaml`; update it before changing endpoint behavior.
- The event contract is `docs/api/events.md`; update it before adding/changing event names or payload shapes.
- Use the Codex app server skill at `.agents/skills/codex-app-server/SKILL.md` whenever you need to work with the Codex app server.
- Start with simple local development assumptions: REST + SSE + in-memory state.
- Avoid persistence, auth, and deployment complexity unless the demo explicitly needs it.

### Agent Adapters (`apps/agent-adapters/`)

- Adapters connect backend agent runtimes to the App Server; mobile should not talk directly to agent runtimes.
- Start with a demo adapter that can register a fake session, answer a screenshot + audio context request from local directory context, and publish `context.answer.ready` / `agent.done`.
- Keep adapter payloads aligned with `docs/api/examples/`.

### Codex Agent Workspace (`apps/codex-agent/`)

- This directory is the intended `cwd` for Codex agents spawned or managed by the App Server.
- Keep runnable agent instructions in `apps/codex-agent/AGENTS.md`.
- Put local Codex-compatible skills under `apps/codex-agent/.agents/skills/`.
- Keep helper scripts lightweight and dependency-free unless a dependency is documented in this directory.
- Runtime request/response payloads and local DuckDB files should stay ignored.
- The MVP agent may read DuckDB directly for context answers; do not introduce a Bun CLI/tool bridge until the direct path is too slow or repetitive.

## Contract-change rule

When changing API or event behavior:

1. Update `docs/api/openapi.yaml` or `docs/api/events.md` first.
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
- Server: run server tests and any contract tests once the server project exists.
- Adapter: run demo script or adapter tests once adapter code exists.

## Commit guidance

Use concise commits that explain why the change exists. If a commit changes contracts or architecture, mention what was tested and what remains untested in the commit body.
