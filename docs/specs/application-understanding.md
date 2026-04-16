# Present Application Understanding

## One-line concept

Open Bubble is a Flutter-first Android companion for backend coding/agent sessions: it gives the phone a small bubble surface that can send phone context to agents and receive agent status back.

## What the app is trying to prove

The hackathon demo should prove that a phone can become a lightweight companion interface for active backend agents without forcing the user to constantly switch to a terminal or desktop dashboard.

## Core actors

| Actor | Role |
| --- | --- |
| Phone user | Wants quick access to agent status and a way to send phone context/screenshot information. |
| Flutter mobile app | Main Android UI, session list/detail, connection settings, and bubble entry point. |
| Native Android layer | System overlay, foreground/background service behavior, notification, and screenshot capture. |
| App Server | Stable API/event boundary between phone and backend agents. |
| Agent adapter | Bridges real or demo backend agent runtimes into App Server sessions/events/context. |
| Backend agent | The coding/work agent doing a task and generating state, context needs, or completion events. |

## Component model

```text
Android phone
  Flutter app UI
    - connection setup
    - session list/detail
    - in-app fallback bubble
  Native Android hooks
    - overlay bubble
    - MediaProjection screenshot capture
    - foreground service / notification handling
          |
          | REST + SSE
          v
App Server
  - sessions
  - context summaries
  - screenshot/context intake
  - event stream fanout
          ^
          |
Agent adapters
  - demo adapter
  - Codex/backend agent adapter
          ^
          |
Backend agent sessions
```

## Data flow summary

1. Agent adapter registers or updates a session with the App Server.
2. Flutter app lists sessions from the App Server.
3. User opens a session and fetches context summary.
4. User captures or sends phone context to the App Server.
5. App Server exposes that context to the relevant adapter/agent flow.
6. Agent adapter emits status or completion events.
7. App Server fans out events through SSE/polling.
8. Flutter/native layer displays the event in the bubble.

## MVP assumptions

- Android is the mobile target.
- Flutter owns most app UI so AM/Aaditya can move quickly.
- Native Android work is limited to platform-specific capabilities.
- App Server can begin as a local server with in-memory data.
- Auth, cloud sync, persistent storage, and production security are out of scope for the first demo.
- The demo may use fake sessions/events if real agent introspection takes too long.

## Key product bet

A small always-available bubble is more useful than a full dashboard when the user only needs quick agent status, context injection, or completion alerts.

## Current open decisions

- Whether mobile listens to events only while foregrounded, through a native foreground service, or both.
- How much screenshot data the first demo sends: full image bytes, compressed image, metadata only, or manual placeholder.
- Whether sessions are discovered automatically or manually registered by the demo adapter.
- Whether the bubble should be a true Android overlay for MVP or an in-app fallback for the first demo checkpoint.
