# `@open-bubble/codex-app-server`

Local TypeScript bridge for starting Codex App Server threads from the Open Bubble API.

## Scope

- repo inference from local config
- `codex app-server` JSON-RPC transport
- synchronous prompt orchestration for the screenshot + text demo flow
- generated protocol bindings under `generated/`

## Generated files

Bindings under `generated/` are produced from:

```bash
codex app-server generate-ts --out ./generated/codex-app-server
codex app-server generate-json-schema --out ./generated/json-schema
```

Do not edit generated files manually.
