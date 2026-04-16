# apps/api

Local Fastify API MVP for Codex Bubble.

## Commands

Run everything from inside `apps/api/`.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

## Local endpoints

- `GET /health`
- `POST /prompt`
- `GET /documentation`
- `GET /openapi.json`

## Prompt request contract

`POST /prompt` uses `multipart/form-data` with:

- `screenMedia`: required file, `image/*` or `video/*`
- `promptText`: optional text field
- `promptAudio`: optional file, `audio/*`

At least one of `promptText` or `promptAudio` must be present.

The frontend forwards `promptAudio` bytes as-is. It does not transcribe them client-side.
