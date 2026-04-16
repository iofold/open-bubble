# AGENTS.md — Open Bubble repo guidance

This file gives coding agents and human teammates the shared operating rules for the Open Bubble repository. It applies to every file in this repo unless a deeper `AGENTS.md` is added later.

## Project intent

Open Bubble is a hackathon prototype for a Flutter-first Android companion bubble. The MVP now centers on a small API that accepts a media prompt and returns a synchronous answer.

## Current phase

We are in a docs-first scaffold phase. Prefer contract/spec updates before implementation. Do not add substantial app/server code until the relevant spec and API contract are updated.

## Source-of-truth docs

- Product boundaries: `docs/specs/product-scope.md`
- Present system understanding: `docs/specs/application-understanding.md`
- User journeys: `docs/specs/user-journeys.md`
- Team workstreams: `docs/specs/team-collaboration.md`
- REST contract: `docs/api/openapi.yaml`
- Demo script: `docs/specs/demo-plan.md`
- Architecture decisions: `docs/adr/`

## Repository layout

```text
apps/
  mobile/          Flutter Android app placeholder
  api/             Fastify API MVP placeholder
  agent-adapters/  Backend/Codex-agent adapter placeholder
docs/
  api/             OpenAPI, sample payloads
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

### API (`apps/api/`)

- Keep all Node.js, TypeScript, build, and test tooling inside `apps/api/`.
- Use strict TypeScript for the API MVP.
- The API contract is `docs/api/openapi.yaml`; update it before changing endpoint behavior.
- Start with simple local development assumptions: REST and in-memory request handling only.
- Avoid persistence, auth, SSE, and deployment complexity unless the demo explicitly needs it.

### Agent Adapters (`apps/agent-adapters/`)

- Adapters connect backend agent runtimes to the API; mobile should not talk directly to agent runtimes.
- Keep adapter payloads aligned with `docs/api/examples/` if and when those examples are relevant to adapter work.

## Contract-change rule

When changing API behavior:

1. Update `docs/api/openapi.yaml` first.
2. Update sample payloads in `docs/api/examples/`.
3. Update affected specs or demo steps.
4. Then implement code in `apps/api/`.

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
