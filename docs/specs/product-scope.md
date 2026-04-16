# Product Scope

The MVP proves that a small local API can accept screen media plus at least one prompt field, either text or raw audio, create a lightweight local task immediately, and expose a polling path for the eventual result.

## Goals

- Keep the API surface limited to `GET /health`, `POST /prompt`, and `GET /tasks/{taskId}`.
- Make the request shape easy to understand and easy to validate.
- Keep the async task flow lightweight enough to run locally on one Mac without extra infrastructure.
- Keep the docs small enough that another teammate can follow them quickly.

## Non-goals

- Broad orchestration.
- Long-lived background channels.
- Auth.
