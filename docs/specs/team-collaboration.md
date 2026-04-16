# Team Collaboration Plan

## Suggested owners

| Lane | Owner | Primary responsibility | Main paths |
| --- | --- | --- | --- |
| Flutter mobile | AM / Aaditya | Flutter UI, app state, Android permission UX, platform-channel boundary | `apps/mobile/`, `docs/specs/mobile-flutter.md` |
| App Server | Teammate 2 | REST/SSE API, session store, screenshot + audio context-request intake, answer/event fanout | `apps/server/`, `docs/specs/server.md`, `docs/api/` |
| Agent adapters + demo | Teammate 3 | Adapter from running backend agents/Codex sessions into local-directory-backed answers/events; demo script | `apps/agent-adapters/`, `docs/specs/agent-adapter.md`, `docs/specs/demo-plan.md` |

Adjust names as soon as the team confirms exact ownership.

## Branching

- `main`: demo-stable only.
- `am/mobile-*`: Flutter/mobile work.
- `server-*`: App Server/API work.
- `adapter-*`: backend agent adapter and demo wiring.
- Keep PRs small; prefer one doc/contract PR before implementation PRs.

## Daily/hackathon checkpoints

1. **Contract checkpoint:** update `docs/api/openapi.yaml` before implementing endpoint changes.
2. **Integration checkpoint:** mobile and server both test against the same sample payloads in `docs/api/examples/`.
3. **Demo checkpoint:** update `docs/specs/demo-plan.md` with the exact steps that currently work.
4. **Risk checkpoint:** log blockers or scope cuts in `docs/specs/risks.md`.

## Definition of done for MVP slices

- Contract updated or confirmed unchanged.
- Sample payload added/updated when behavior changes.
- Demo plan step added if visible in demo.
- Known limitations documented.
