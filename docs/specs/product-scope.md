# Product Scope

The MVP proves that a small local API can accept screen media plus at least one prompt field, either text or raw audio, and return a synchronous JSON answer.

## Goals

- Keep the API surface limited to `GET /health` and `POST /prompt`.
- Make the request shape easy to understand and easy to validate.
- Keep the docs small enough that another teammate can follow them quickly.

## Non-goals

- Broad orchestration.
- Long-lived background channels.
- Persistence or auth for the first cut.
