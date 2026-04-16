# Risks and Scope Cuts

| Risk | Impact | Mitigation / scope cut |
| --- | --- | --- |
| Android overlay permission UX takes too long | Bubble demo blocked | Fall back to in-app floating bubble for demo |
| MediaProjection screenshot flow is slow to implement | Screenshot demo blocked | Send metadata/manual image placeholder first |
| Backend agent runtime is hard to introspect | Context fetch blocked | Manually register demo sessions through App Server |
| Event stream unreliable on device/network | Notifications blocked | Add polling fallback for `/v1/events` |
| Contract churn causes merge conflicts | Team slows down | Change `docs/api/openapi.yaml` first, then implement |
