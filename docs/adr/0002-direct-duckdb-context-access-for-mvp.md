# ADR 0002: Use direct DuckDB context access for the MVP

## Status

Accepted for hackathon scaffold.

## Context

The mobile frontend needs quick answers to screenshot + audio context questions. The backend may have useful local context in a DuckDB database with graph-like relations and vector/search tables. A production system would likely add a stable tool bridge or service boundary, but that adds ceremony before the hackathon query path is proven.

## Decision

For MVP, allow the backend agent/query layer to access local DuckDB directly. The App Server should first try to answer a context request from fast local context: in-memory session state, local files, and direct DuckDB queries. If that is not enough, the request can continue asynchronously through slower agent skills or sub-agents.

A Bun CLI or similar tool surface is deferred until direct access becomes too slow, repetitive, or difficult to share across agent harnesses.

## Consequences

- The first implementation can stay small and fast.
- The frontend can receive immediate answers when local context is enough.
- The agent can still use deeper skills/sub-agents for hard questions without blocking the initial request.
- DuckDB schema assumptions will be closer to the agent code during MVP.
- A later CLI/tool bridge may still be useful for batching, portability, and performance instrumentation.
