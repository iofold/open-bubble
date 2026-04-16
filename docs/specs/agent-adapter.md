# Adapter Notes

The current MVP does not define an active backend adapter contract.

The active API contract is still intentionally small: `POST /prompt` creates a local async task and `GET /tasks/{taskId}` exposes polling for its status and result.

Keep this file as a short placeholder until the API grows beyond this local task-and-poll flow.

Future-scope references from `main`, including Codex-agent integration and direct DuckDB reads, remain available elsewhere in the repo and can be activated once the `/prompt` MVP expands beyond the current async polling flow.
