# apps/api AGENTS.md

This directory owns the local API MVP.

- Use Node.js, TypeScript, and Fastify only inside `apps/api/`.
- Keep package.json, lockfiles, build scripts, tests, and runtime code here.
- Work from `apps/api/` for install, build, dev, and test commands.
- Install dependencies with `npm install`.
- Start local development with `npm run dev`.
- Run tests with `npm test`.
- Run strict typechecking with `npm run typecheck`.
- Build the compiled server with `npm run build`.
- Start the compiled server with `npm run start`.
- Use `GET /documentation` for the local Swagger UI and `GET /openapi.json` for the current parsed contract.
- `POST /prompt` is multipart/form-data with required `screenMedia`, optional `promptText`, optional raw `promptAudio`, and at least one prompt field.
- `POST /prompt` creates a lightweight local task and `GET /tasks/:taskId` is the polling endpoint for task status and results.
- Keep the API limited to `GET /health`, `POST /prompt`, and `GET /tasks/:taskId` unless `docs/api/openapi.yaml` changes first.
- Prefer strict TypeScript and small route modules.
