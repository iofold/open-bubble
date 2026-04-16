# Present Application Understanding

## One-line concept

Open Bubble is a Flutter-first Android companion for backend coding/agent sessions: it lets the user ask phone-context questions with a screenshot plus audio prompt, routes that question to the backend, answers it using context maintained in a local directory, and returns agent status through a bubble surface.

## What "fetch context" means

In this product, **fetching context is not just reading a passive session summary**. The primary interaction is:

1. The user captures or provides a screenshot from the phone.
2. The user records an audio prompt, optionally with a transcript.
3. Mobile sends the screenshot + audio prompt to the App Server for a specific session.
4. The backend/adapter answers the user's question using the local directory context maintained by the running agent/session.

The local directory context is the backend-side source of truth: repository files, session state, recent agent messages, and other context the local agent has available. The phone contributes the user's current visual/audio intent.

## Code assertion rule

The system can also answer or verify an **outgoing code assertion**, but only when the user explicitly asks for that in the prompt. Do not infer a code-assertion task from every screenshot or generic context question.

Examples that should count as explicit code-assertion intent:

- "Assert that this outgoing change fixes the failing login test."
- "Check whether the patch I'm about to send is safe."
- "Verify this code claim against the repository."

Examples that should stay normal context questions:

- "What is this screen showing?"
- "What should I do next?"
- "Why is this agent blocked?"

## What the app is trying to prove

The hackathon demo should prove that a phone can become a lightweight companion interface for active backend agents without forcing the user to constantly switch to a terminal or desktop dashboard.

## Core actors

| Actor | Role |
| --- | --- |
| Phone user | Asks a contextual question with screenshot + audio prompt, may explicitly ask for code assertion, and receives answers/status. |
| Flutter mobile app | Main Android UI, session list/detail, audio prompt capture, screenshot handoff, connection settings, and bubble entry point. |
| Native Android layer | System overlay, foreground/background service behavior, notification, screenshot capture, and possibly audio capture helpers. |
| App Server | Stable API/event boundary between phone and backend agents; receives multimodal context requests and returns/streams answers. |
| Agent adapter | Bridges real or demo backend agent runtimes into App Server sessions/events/context requests. |
| Backend agent | The coding/work agent that has local directory context and can answer user prompts or explicit code-assertion requests. |

## Component model

```text
Android phone
  Flutter app UI
    - connection setup
    - session list/detail
    - audio prompt capture
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
  - local-context request intake
  - screenshot + audio prompt payloads
  - context answers / event stream fanout
          ^
          |
Agent adapters
  - demo adapter
  - Codex/backend agent adapter
  - local directory context resolver
          ^
          |
Backend agent sessions + local working directory context
```

## Data flow summary

1. Agent adapter registers or updates a session with the App Server.
2. Flutter app lists sessions from the App Server.
3. User chooses a session and asks a question by sending screenshot + audio prompt.
4. App Server stores/forwards that context request to the relevant adapter/agent flow.
5. Agent/adapter answers using local directory context for that session.
6. If the user explicitly asked for code assertion, the adapter treats the request as a code-assertion/verification task; otherwise it stays a normal context question.
7. Agent adapter emits answer/status/completion events.
8. App Server fans out events through SSE/polling.
9. Flutter/native layer displays the answer or status in the app/bubble.

## MVP assumptions

- Android is the mobile target.
- Flutter owns most app UI so AM/Aaditya can move quickly.
- Native Android work is limited to platform-specific capabilities.
- App Server can begin as a local server with in-memory data.
- Audio can start as recorded audio bytes plus optional manual/mock transcript if speech-to-text is not ready.
- Screenshot capture can fall back to metadata/manual placeholder if MediaProjection is not ready.
- Auth, cloud sync, persistent storage, and production security are out of scope for the first demo.
- The demo may use fake sessions/events if real agent introspection takes too long.

## Key product bet

A small always-available bubble is more useful than a full dashboard when the user only needs to ask a context-rich question, inject phone-side context, or receive agent completion alerts.

## Current open decisions

- Whether mobile listens to events only while foregrounded, through a native foreground service, or both.
- Whether first-demo audio uses real device recording, mock transcript, or both.
- How much screenshot data the first demo sends: full image bytes, compressed image, metadata only, or manual placeholder.
- Whether sessions are discovered automatically or manually registered by the demo adapter.
- Whether the bubble should be a true Android overlay for MVP or an in-app fallback for the first demo checkpoint.
- What exact backend component owns local directory context retrieval: server module, adapter, or running agent.
