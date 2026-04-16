# apps/api AGENTS.md

This directory owns the local API MVP.

- Use Node.js, TypeScript, and Fastify only inside `apps/api/`.
- Keep package.json, lockfiles, build scripts, tests, and runtime code here.
- Work from `apps/api/` for install, build, dev, and test commands.
- Keep the API limited to `GET /health` and `POST /prompt` unless `docs/api/openapi.yaml` changes first.
- Prefer strict TypeScript and small route modules.
