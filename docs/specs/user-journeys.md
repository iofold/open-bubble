# User Journeys

These journeys describe the current intended behavior. They are not all implementation commitments yet; use them to align mobile, server, and adapter work.

## Journey 1: New teammate starts contributing

**Goal:** A teammate understands where to work without asking for repo structure context.

1. Teammate clones the repo.
2. Reads `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`.
3. Picks their lane from `docs/specs/team-collaboration.md`.
4. Reviews relevant specs and API/event contracts.
5. Opens a small branch for their lane.

**Success:** They can start mobile, server, or adapter work without conflicting with other lanes.

## Journey 2: User connects the mobile app to the App Server

**Goal:** Phone can talk to the backend boundary.

1. User opens the Flutter app.
2. User enters or confirms the App Server URL.
3. App calls `GET /health`.
4. App shows connected/disconnected state.
5. App stores the server URL locally for the demo.

**API touchpoints:** `GET /health`

**Fallback:** If the server is unreachable, show a clear connection error and allow editing the URL.

## Journey 3: User views running backend sessions

**Goal:** User sees which agents/sessions are active before asking a contextual question.

1. App loads the sessions screen.
2. App calls `GET /v1/sessions`.
3. User sees session title, status, agent kind, and last updated time.
4. User taps a session to open detail.

**API touchpoints:** `GET /v1/sessions`, `GET /v1/sessions/{sessionId}`

**Success:** User can identify the session whose local directory context should answer the phone-side prompt.

## Journey 4: User asks a context question with screenshot + audio

**Goal:** User asks something about what they are seeing/hearing on the phone, and the backend answers using local directory context.

1. User opens a session detail screen.
2. User captures a screenshot or chooses the current screen as visual context.
3. User records an audio prompt such as "What should I do next here?" or "Why is this agent blocked?"
4. App sends screenshot + audio prompt/transcript to the App Server.
5. Server associates the request with the selected session.
6. Adapter/backend agent answers using the local directory context maintained for that session.
7. App shows the answer in the session detail and/or bubble.

**API/event touchpoints:** `POST /v1/sessions/{sessionId}/context-requests`, `context.requested`, `context.answer.ready`

**Success:** The answer reflects both the user's phone-side screenshot/audio intent and the backend's local directory context.

## Journey 5: User explicitly asks for an outgoing code assertion

**Goal:** User asks the backend to verify a code-related claim/change, and the system only enters this mode because the user explicitly requested it.

1. User captures a screenshot and records or types the prompt as usual.
2. User's audio prompt explicitly says they want a code assertion or verification, for example: "Assert this outgoing code change is safe" or "Verify this patch claim against the repo."
3. Mobile marks the context request intent as `code_assertion`, or the backend classifies it only after explicit wording is present in the transcript.
4. Adapter/backend agent checks the claim against local directory context and available session state.
5. App shows the assertion result, including uncertainty or required follow-up if the claim cannot be verified.

**API/event touchpoints:** `POST /v1/sessions/{sessionId}/context-requests`, `code.assertion.requested`, `code.assertion.ready`

**Guardrail:** Do not perform or present code assertion as the default behavior. It must be user-mentioned.

## Journey 6: User sends screenshot/audio context without full native support

**Goal:** Preserve the main product loop while Android-native capture is still under development.

1. User taps a capture/send-context action.
2. If screenshot capture is ready, native Android provides image bytes/metadata.
3. If audio recording is ready, Flutter/native provides audio bytes and optional transcript.
4. If either capture path is not ready, the app uses a manual placeholder, typed transcript, or sample payload.
5. App sends the best available payload to the App Server.

**API touchpoints:** `POST /v1/sessions/{sessionId}/context-requests`

**Fallback:** The demo can use metadata/manual screenshot and typed transcript while proving the server/adapter contract.

## Journey 7: Agent completion appears in the bubble

**Goal:** User notices backend work finished without watching the backend directly.

1. Agent finishes or reaches a meaningful state.
2. Agent adapter publishes `agent.done` to the App Server.
3. Mobile receives the event via SSE or polling fallback.
4. Bubble updates with completion title/message.
5. User taps the bubble.
6. App opens the related session detail.

**API/event touchpoints:** `POST /v1/events`, `GET /v1/events/stream`, `agent.done`

**Success:** User gets a visible, low-friction completion signal on the phone.

## Journey 8: Agent asks for user input/context

**Goal:** Agent can pull the user back in when blocked or needing phone-side context.

1. Backend agent decides it needs user input, screenshot context, or an audio clarification.
2. Adapter publishes `agent.input.requested`.
3. Bubble shows a prompt.
4. User taps bubble to open session detail.
5. User sends screenshot + audio/typed prompt.
6. Agent continues with the user's prompt plus local directory context.

**API/event touchpoints:** `agent.input.requested`, `POST /v1/sessions/{sessionId}/context-requests`

**Success:** The bubble feels like a lightweight agent handoff surface, not just a notification.

## Journey 9: Hackathon demo fallback path

**Goal:** Preserve a working demo even if native Android APIs take longer than expected.

1. Use a fake/demo adapter to register `Hackathon Agent`.
2. Use in-app floating bubble instead of true overlay.
3. Use metadata/manual screenshot instead of real screenshot bytes.
4. Use typed transcript instead of real audio recording if needed.
5. Publish sample `context.answer.ready` and `agent.done` events.
6. Show that mobile/server/adapter contract works end-to-end.

**Success:** The story is demoable even before platform-channel polish is complete.
