# Contributing to Open Bubble

Open Bubble is moving fast for a hackathon, so the main collaboration goal is to avoid blocking each other.

## First read

1. `README.md`
2. `AGENTS.md`
3. `docs/specs/product-scope.md`
4. `docs/specs/application-understanding.md`
5. `docs/specs/user-journeys.md`
6. `docs/specs/team-collaboration.md`
7. `docs/api/openapi.yaml` and `docs/api/events.md`

## Suggested branch names

- `am/mobile-*` for Flutter/mobile work
- `server-*` for App Server work
- `adapter-*` for agent adapter/demo work
- `docs-*` for specs/contracts/collaboration docs

## Before opening a PR

- Confirm your change stays in one lane unless coordination is needed.
- Update API/event docs before implementation if the contract changes.
- Update sample payloads when payload shape changes.
- Update `docs/specs/demo-plan.md` if the demo flow changes.
- Add known risks or cuts to `docs/specs/risks.md`.

## Local verification right now

This scaffold intentionally has almost no implementation yet. For docs changes, run:

```bash
python3 -m json.tool docs/api/examples/session.json >/dev/null
python3 -m json.tool docs/api/examples/context.json >/dev/null
python3 -m json.tool docs/api/examples/event-agent-done.json >/dev/null
python3 - <<'PY'
import yaml
with open('docs/api/openapi.yaml') as f:
    yaml.safe_load(f)
print('openapi yaml ok')
PY
git diff --check
```

If `PyYAML` is unavailable, note that in the PR and at least run JSON validation plus `git diff --check`.
