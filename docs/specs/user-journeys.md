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

**Goal:** User sees which agents/sessions are active.

1. App loads the sessions screen.
2. App calls `GET /v1/sessions`.
3. User sees session title, status, agent kind, and last updated time.
4. User taps a session to open detail.

**API touchpoints:** `GET /v1/sessions`, `GET /v1/sessions/{sessionId}`

**Success:** User can identify the session they care about in a few seconds.

## Journey 4: User fetches context from a running agent session

**Goal:** User gets a compact summary of what an agent is doing.

1. User opens a session detail screen.
2. App calls `GET /v1/sessions/{sessionId}/context`.
3. App displays current task, summary, relevant files, and recent messages.
4. User decides whether to send more phone context.

**API touchpoints:** `GET /v1/sessions/{sessionId}/context`

**Success:** User can understand the agent state without opening the backend terminal.

## Journey 5: User sends screenshot or phone context to an agent

**Goal:** User gives the backend agent phone-side context.

1. User taps a capture/send-context action.
2. Flutter asks native Android layer to capture screenshot or prepare context metadata.
3. Native Android handles any required permission flow.
4. App sends screenshot bytes or metadata to the App Server.
5. Server accepts and associates it with the session.
6. Adapter/agent can consume the new context.

**API touchpoints:** `POST /v1/sessions/{sessionId}/screenshots`

**Fallback:** If MediaProjection is not ready, send notes/metadata or a manually selected placeholder for the demo.

## Journey 6: Agent completion appears in the bubble

**Goal:** User notices backend work finished without watching the backend directly.

1. Agent finishes or reaches a meaningful state.
2. Agent adapter publishes `agent.done` to the App Server.
3. Mobile receives the event via SSE or polling fallback.
4. Bubble updates with completion title/message.
5. User taps the bubble.
6. App opens the related session detail.

**API/event touchpoints:** `POST /v1/events`, `GET /v1/events/stream`, `agent.done`

**Success:** User gets a visible, low-friction completion signal on the phone.

## Journey 7: Agent asks for user input/context

**Goal:** Agent can pull the user back in when blocked or needing context.

1. Backend agent decides it needs user input or phone context.
2. Adapter publishes `agent.input.requested`.
3. Bubble shows a prompt.
4. User taps bubble to open session detail.
5. User sends screenshot, note, or other context.
6. Agent continues.

**API/event touchpoints:** `agent.input.requested`, screenshot/context endpoint

**Success:** The bubble feels like a lightweight agent handoff surface, not just a notification.

## Journey 8: Hackathon demo fallback path

**Goal:** Preserve a working demo even if native Android APIs take longer than expected.

1. Use a fake/demo adapter to register `Hackathon Agent`.
2. Use in-app floating bubble instead of true overlay.
3. Use metadata/manual payload instead of real screenshot bytes.
4. Publish sample `agent.done` event.
5. Show that mobile/server/adapter contract works end-to-end.

**Success:** The story is demoable even before platform-channel polish is complete.
