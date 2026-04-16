# Risks and Scope Cuts

| Risk | Impact | Mitigation / scope cut |
| --- | --- | --- |
| Accessibility onboarding is confusing or blocked by restricted settings | Bubble demo blocked on real devices | Add explicit setup checklist, restricted-settings guidance, and in-app connectivity checks |
| Accessibility tree is incomplete or stale in some apps | Read/write demo becomes flaky | Re-resolve focused nodes right before action and show unsupported-state UI instead of forcing writes |
| Screenshot capture fails on secure windows or rapid repeated calls | Capture demo feels unreliable | Make captures best-effort, debounce them, and surface clear failure states |
| Prompt and media validation is confusing | API/mobile integration slows down | Keep `POST /prompt` simple: required `screenMedia`, plus `promptText` or raw `promptAudio` |
| Local HTTP dev server is blocked by cleartext or network issues | Emulator testing fails even when code is correct | Explicitly allow cleartext dev traffic, surface health-check status, and show network/task errors in the bubble |
| Task polling never completes or returns an error | User does not know whether the request worked | Apply bounded polling, emit task-failed events, post a clear notification, and keep the review UI in sync |
| Contract drift causes confusion | Teammates implement incompatible flows | Update `docs/api/openapi.yaml` before API behavior changes |
| Gmail/Drive/Calendar connector data leaks too much private context | Trust and demo safety risk | Query connectors only when prompt-relevant, ingest minimized snippets with provenance, and keep tokens/secrets out of DuckDB and logs |
| Graph control panel becomes too large for MVP | Backend/frontend scope creep | Start with a read-only explorer and defer editing, auth, and production dashboards |
