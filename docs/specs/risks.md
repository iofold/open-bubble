# Risks and Scope Cuts

| Risk | Impact | Mitigation / scope cut |
| --- | --- | --- |
| Accessibility onboarding is confusing or blocked by restricted settings | Bubble demo blocked on real devices | Add explicit setup checklist, restricted-settings guidance, and in-app connectivity checks |
| Accessibility tree is incomplete or stale in some apps | Read/write demo becomes flaky | Re-resolve focused nodes right before action and show unsupported-state UI instead of forcing writes |
| Screenshot capture fails on secure windows or rapid repeated calls | Capture demo feels unreliable | Make captures best-effort, debounce them, and surface clear failure states |
| Backend agent runtime is hard to introspect | Context fetch blocked | Manually register demo sessions through App Server or use mocked responses in the client |
| Event stream unreliable on device/network | Notifications blocked | Add polling fallback for `/v1/events` and keep mock flows available |
| Contract churn causes merge conflicts | Team slows down | Update `docs/api/openapi.yaml` first, then implement |
