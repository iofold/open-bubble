# apps/codex-app-server AGENTS.md

This directory owns the local TypeScript bridge to `codex app-server`.

- Keep Node.js, TypeScript, build, test, and generated App Server bindings inside `apps/codex-app-server/`.
- Generate Codex App Server TypeScript bindings and JSON schema inside `apps/codex-app-server/generated/`.
- Files under `apps/codex-app-server/generated/` are auto-generated. Do not edit them manually; regenerate them instead.
- Keep the public surface small: repo inference config, local App Server transport, and prompt orchestration.
- Prefer dependency injection around the process transport so tests do not require a live Codex daemon.
- Run tests with `npm test`.
- Run strict typechecking with `npm run typecheck`.
- Build the package with `npm run build`.
