# Technical Architecture Writeup

This writeup summarizes the Open Bubble technical architecture for hackathon submission planning. It reflects the current `main` workspace at `a7ba07d` plus the mobile architecture work fetched from `origin/am/mobile-accessibility-foundation` at `ad3b32a`.

The important integration caveat is that the mobile foundation branch diverged from the current backend/control-panel architecture at merge base `1012340`. Treat that branch as the source for the Android mobile runtime design, not as a clean full-repo replacement for current `main`.

## Product Thesis

Open Bubble is a floating Android question surface for the current screen. The user opens a bubble, asks a prompt about what they are looking at, and gets a response that can be reviewed before copying or filling into another app.

The MVP proves four technical claims:

1. A Flutter Android companion can keep a small floating bubble available over other apps.
2. The native Android layer can capture screen context through Accessibility APIs without a MediaProjection-first flow.
3. A local Fastify API can accept screen media plus prompt text or raw prompt audio, create an async task, and expose task polling.
4. Backend-owned context graph and connector routes can keep private context local, inspectable, and provenance-linked.

## High-Level Architecture

```text
Android user
  -> Flutter app shell
    -> MethodChannel / EventChannel
      -> Android AccessibilityService runtime
        -> accessibility overlay bubble
        -> prompt composer overlay
        -> window inspection and screenshot capture
        -> focused-field fill / clipboard / notification
    -> Fastify API over local network or ngrok
      -> /health, /apps, /prompt, /tasks/:taskId
      -> classifier-backed async prompt task processor
      -> DuckDB-backed context graph routes
      -> Composio MCP connector dispatch
      -> React context graph control panel
```

The current project deliberately separates the phone UX from the backend context runtime. Flutter does not call Gmail, Google Drive, Google Calendar, DuckDB, or MCP providers directly. The phone sends only the screen/prompt request to the API. The API owns connector access, graph ingestion, task routing, and control-panel inspection.

## Runtime Components

### Mobile Companion

Source: `origin/am/mobile-accessibility-foundation`.

The mobile app is a Flutter Android app with a native Android accessibility runtime.

Flutter owns:

- onboarding and setup status,
- App Server base URL configuration,
- server health checks,
- request/task history,
- review-before-fill UI,
- local mock sessions for demos,
- the platform bridge that translates native events into app state.

Native Android owns:

- `AccessibilityService`,
- `TYPE_ACCESSIBILITY_OVERLAY` floating bubble,
- prompt composer overlay rendered above the current app,
- active-window inspection,
- screenshot capture through `AccessibilityService.takeScreenshot()` and `takeScreenshotOfWindow()` where available,
- task submission from the background runtime,
- clipboard writes, notifications, and focused-field fill.

The branch raises the mobile runtime baseline to `minSdk 30` so screenshot capture can use Accessibility APIs instead of a MediaProjection-first flow. On Android 14/API 34 and newer, the runtime can prefer window-scoped screenshot capture. On older supported devices, it falls back to display screenshot capture and temporarily hides the bubble to avoid capturing the overlay.

### Mobile State And Bridge

The Flutter/native boundary is intentionally narrow:

- Method channel: `dev.openbubble.mobile/platform`
- Event channel: `dev.openbubble.mobile/events`

Flutter methods include:

- `getServiceStatus`
- `getRecentEvents`
- `getServerBaseUrl`
- `setServerBaseUrl`
- `openAccessibilitySettings`
- `openNotificationSettings`
- `showBubble`
- `hideBubble`
- `inspectActiveWindow`
- `captureActiveWindow`
- `fillFocusedField`
- `copyText`

Native events include:

- `service.connected`
- `service.disconnected`
- `bubble.shown`
- `bubble.hidden`
- `bubble.longPress`
- `inspection.ready`
- `capture.started`
- `capture.ready`
- `capture.failed`
- `overlay.workflow.started`
- `task.accepted`
- `task.completed`
- `task.failed`
- `overlay.reply.ready`
- `fill.completed`
- `fill.failed`

`OpenBubbleController` listens to the event stream, hydrates recent native events after app resume, checks API health, tracks request stages, and exposes the latest review draft to the UI. This keeps the Flutter activity useful as a dashboard while the background prompt flow continues inside the AccessibilityService.

### Accessibility Runtime

The native runtime is centered on `OpenBubbleAccessibilityService`.

It tracks the last external app/window from accessibility events, resolves the best target window, walks the accessibility node tree to collect a compact `WindowSnapshot`, and locates editable fields for fill operations. It emits snapshots and task lifecycle events through `OpenBubbleEventHub` so Flutter can rebuild state without polling native internals.

The overlay runtime is centered on `BubbleOverlayController`.

The bubble supports:

- single tap: open a compact action panel,
- long press: open the prompt composer,
- drag: reposition the bubble,
- status states: idle, working, ready, error.

The prompt composer collects explicit user text while the current app stays visible underneath. On send, the service captures the current external window, persists the screenshot into app cache, submits the multipart prompt request, polls the task result, copies the answer to the clipboard, posts a notification when allowed, and emits a review event back to Flutter.

### Local API

Source: current `main` workspace.

The local API is a Fastify/TypeScript app under `apps/api`. The canonical contract is `docs/api/openapi.yaml`.

Core endpoints:

- `GET /health`
- `GET /apps`
- `POST /prompt`
- `GET /tasks/:taskId`

Context/control endpoints:

- `GET /context-graph`
- `GET /context-graph/stream`
- `POST /context-graph/seed`
- `POST /context-graph/ingest/mcp-results`
- `POST /context-graph/ingest/context-request`
- `POST /context-graph/connectors`
- `GET /control-panel/`
- `GET /documentation`
- `GET /openapi.json`

`POST /prompt` accepts multipart form data:

- required `screenMedia`, with `image/*` or `video/*`,
- optional `promptText`,
- optional raw `promptAudio`, with `audio/*`,
- at least one of `promptText` or `promptAudio`.

The mobile client currently needs only the screenshot plus typed prompt path for the hackathon mobile milestone. The API contract still keeps raw audio as a supported input, and the frontend should forward audio bytes without client-side transcription.

### Async Task Manager

The API returns quickly from `POST /prompt` with `202 Accepted`, a task id, and a status URL. It persists local task state under `apps/api/.local/tasks/` and lets clients poll `GET /tasks/:taskId`.

Completed prompt tasks include:

- request classification: `coding_request`, `personal_context_request`, or `action_request`,
- relevant app names from the supported app list when the classifier can infer them,
- the original prompt fields,
- stored screen media metadata/path,
- a routing payload,
- a handoff plan with inferred intent, deliverable, screenshot summary, context sources, suggested skills, response style, and expanded downstream prompt,
- a default fallback coding workspace under repo-root `tmp/` for coding requests.

The classifier-backed processor is configured through environment variables:

- `OPENAI_API_KEY`
- `OPEN_BUBBLE_CLASSIFIER_MODEL`, defaulting to `gpt-5.4`
- `OPEN_BUBBLE_CLASSIFIER_BASE_URL`

### Context Graph Runtime

The current architecture makes `apps/api` the owner of graph runtime behavior. `apps/codex-agent` is now a schemas, fixtures, references, and local skill workspace rather than a second graph implementation.

The graph model has four practical layers:

- episodes: raw source events such as frontend context requests, seed context, and connector fetches,
- entities: sessions, devices, context requests, screenshots, voice notes, screen apps, user intents, tasks, files, answers, connector objects, people, and organizations,
- relations: provenance-linked edges such as `has_screenshot`, `expresses_intent`, `current_task`, `derived_from_mcp`, `sent_by`, `owned_by`, and `scheduled_with`,
- chunks: searchable snippets for low-latency answer retrieval.

The DuckDB-backed graph is intentionally local-first. The control surface should expose what was ingested, where facts came from, and which snippets supported an answer.

### MCP Connectors

Gmail, Google Drive, and Google Calendar are backend/local context sources. The API can dispatch prompt-relevant connector work through Composio MCP.

Allowed MVP read tools:

- Gmail fetch/search,
- Drive file search/fetch,
- Calendar event listing.

Allowed MVP action tools:

- Gmail draft creation,
- Google Calendar event creation.

The action lane is narrow by design. It does not put provider credentials in the mobile app, and it does not expose broad write tools. Connector-derived snippets should be minimized, provenance-linked, and kept out of logs, fixtures, and response payloads unless they are the specific answer context the user requested.

### Control Panel

The graph control panel is a React/Vite local operator UI under `apps/control-panel`. The Fastify API serves the built app from `/control-panel/`, and the panel can also run separately with `VITE_OPEN_BUBBLE_API_BASE_URL`.

Its job is not to be the Android UI. Its job is to prove inspectability:

- graph canvas,
- node and edge filters,
- connector filters,
- session selector,
- search,
- selected node inspector,
- provenance path,
- answer trace,
- graph health and recent episodes.

For the hackathon story, this is the evidence view: the bubble produces a question, the API produces or routes an answer, and the control panel explains why the system knew what it knew.

## End-To-End Flows

### 1. Setup And Health

```text
User opens Flutter app
  -> Flutter reads persisted server base URL through platform channel
  -> Flutter calls GET /health
  -> Flutter asks native service for accessibility status
  -> user opens Android Accessibility Settings if needed
  -> service connects and emits service.connected
  -> user shows the bubble
```

This flow makes the demo state visible: accessibility enabled, service connected, bubble visible, notifications enabled/disabled, capture support, SDK level, and API health.

### 2. Prompt From Another App

```text
User long-presses bubble
  -> prompt composer overlay opens above the current app
  -> user types an explicit prompt
  -> service captures the current external window
  -> screenshot is persisted to app cache
  -> PromptTaskClient posts multipart /prompt
  -> API returns task id and statusUrl
  -> native runtime polls GET /tasks/:taskId
  -> completed answer is copied to clipboard
  -> optional notification is posted
  -> overlay.reply.ready event hydrates Flutter review UI
  -> user reviews before filling into the focused field
```

This is the mobile foundation branch's strongest architecture update. The request can start and finish while Flutter is not foregrounded, but Flutter still receives the result for review.

### 3. Mock Demo Flow

The mobile branch also keeps mock sessions and mock reply generation. These support a resilient demo when the real API, network tunnel, or context graph is unavailable.

Mock flow:

```text
bubble capture or Flutter test action
  -> compact window snapshot
  -> mock session selected
  -> mock reply draft generated
  -> fill suggestion cached
  -> clipboard/fill/review path exercised
```

This is useful for proving the mobile UX and accessibility runtime independently from backend readiness.

### 4. Context Graph Answer Flow

```text
Prompt or context request reaches API
  -> request is classified
  -> relevant context source is selected
  -> optional connector dispatch fetches minimized snippets
  -> graph records episodes, entities, relations, and chunks
  -> ContextAnswer or task result is returned
  -> control panel streams graph.snapshot updates
```

This flow is the privacy and provenance story. Connector data stays backend/local, and the graph can show exactly which request, screenshot, prompt, connector snippet, or seed fact influenced the answer.

## Security, Privacy, And UX Boundaries

The architecture uses a few hard boundaries that are worth stating in the submission:

- Android accessibility access is explicit and user-enabled.
- The app should never silently submit data to the server without explicit user action.
- The app should never silently fill remote-generated text into another app.
- Review-before-fill is required after a remote answer arrives.
- Secure or unsupported screens should fail clearly and locally.
- Flutter does not own Gmail, Drive, Calendar, DuckDB, or MCP integrations.
- Connector reads are prompt-relevant, minimized, and provenance-linked.
- Connector actions are limited to Gmail draft creation and Calendar event creation.
- Local secrets and OAuth/Composio credentials must not be stored in graph data, logs, fixtures, or mobile payloads.

## Branch Integration Notes

`origin/am/mobile-accessibility-foundation` should be integrated carefully because it contains the mobile implementation but diverges from current `main`.

Preserve from current `main`:

- API-owned context graph runtime,
- React/Vite control panel under `apps/control-panel`,
- `apps/codex-agent` as references/schemas/fixtures rather than graph runtime,
- current OpenAPI contract and task classification/handoff semantics,
- `apps/codex-app-server` package/build integration.

Port from the mobile branch:

- full Flutter project under `apps/mobile`,
- Android AccessibilityService runtime,
- Flutter platform bridge and controller,
- prompt composer overlay,
- `PromptTaskClient` multipart upload and task polling,
- mobile spec update around accessibility-first capture,
- ADR 0002 for accessibility-first Android runtime.

Resolve intentionally:

- The mobile branch includes older full-repo state in addition to mobile work. Avoid a wholesale merge that deletes or rolls back current backend/control-panel files.
- The mobile client expects `/prompt` and `/tasks/{taskId}`; that is aligned with current `main`.
- The mobile client currently submits `screenMedia` plus `promptText`; raw `promptAudio` remains an API contract capability but is not required for the first Android milestone.
- The mobile app uses cleartext dev URLs for local API access; this is acceptable for hackathon local/tunnel demos and should be revisited before distribution.

## Hackathon Submission Framing

The clearest technical story is:

Open Bubble turns any Android screen into an askable context. A Flutter shell gives the user setup, review, and control. A native AccessibilityService provides the always-available bubble, current-screen inspection, screenshot capture, and safe fill path. A local Fastify API accepts screen media plus prompt input, classifies the request, and runs async task polling. A backend-owned DuckDB context graph plus Composio MCP connector lane keeps private context local, minimized, and inspectable. The React control panel proves that answers can be traced back to their source context instead of appearing as opaque assistant text.

Recommended demo proof points:

1. Show the Android bubble over another app.
2. Long-press, type a prompt, and submit a screenshot-backed request.
3. Show task acceptance and polling.
4. Show answer delivery into clipboard/notification/review UI.
5. Show the API/control panel graph view for provenance and connector boundaries.

Recommended safe claims:

- "The mobile architecture is accessibility-first for recurring capture and fill."
- "The API accepts required screen media plus text or raw audio and returns an async task handle."
- "The phone does not call Google providers directly."
- "Context graph data is local, minimized, and inspectable."
- "Generated text is reviewed before filling into another app."

Claims to avoid until more integration lands:

- "Every mobile prompt is already backed by live connector retrieval."
- "The system can safely automate arbitrary app actions."
- "The mobile branch can be merged wholesale without reconciling backend divergence."
- "The Android runtime works on every app surface, including secure screens."

## Near-Term Build Plan

1. Port the mobile branch into current `main` as a mobile-focused integration, preserving current backend and control-panel files.
2. Keep the first real mobile/API path to `screenMedia` plus `promptText`.
3. Add a small mobile integration test checklist: service connected, bubble visible, composer opens, capture succeeds or fails cleanly, `/health` passes, `/prompt` returns `202`, `/tasks` completes or fails visibly.
4. Update the demo script so it reflects task polling and the accessibility-first mobile runtime.
5. Decide whether hackathon judging should see live Composio connector reads or fixture-backed graph provenance. Fixture-backed provenance is safer if credentials or network setup are unstable.
