# apps/control-panel

React/Vite context graph control panel for Open Bubble.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

Set `VITE_OPEN_BUBBLE_API_BASE_URL` when running separately from the API:

```bash
VITE_OPEN_BUBBLE_API_BASE_URL=http://localhost:3000 npm run dev -- --host 0.0.0.0
```

When built, the Fastify API serves `dist/` from `/control-panel/`.
