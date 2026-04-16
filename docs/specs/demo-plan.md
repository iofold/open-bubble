# Demo Plan

1. Start the local API from `apps/api`.
2. Call `GET /health`.
3. Ensure the local Codex App Server bridge is configured with at least one repo mapping.
4. Send one screenshot plus a text request to `POST /prompt`.
5. Show the returned repo id, branch, thread id, answer summary, and PR URL in the client.

If needed, keep the story focused on a single round trip and leave richer workflows for a later pass.
