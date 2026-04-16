# Mobile Flutter Spec

## Scope

The mobile app is a Flutter Android app. Flutter owns the regular app UI and state. Native Android code should be kept behind platform channels for OS-specific capabilities.

## Mobile surfaces

1. **Connection screen**
   - Configure App Server base URL.
   - Show connection health.
2. **Sessions screen**
   - List active sessions from `GET /v1/sessions`.
   - Open a session detail view.
3. **Session detail**
   - Show selected session metadata.
   - Let the user capture/send screenshot + audio prompt as a context request.
   - Show answers returned for context requests.
   - Keep `GET /v1/sessions/{sessionId}/context` as a passive summary/debug view, not the primary "fetch context" action.
4. **Context request composer**
   - Screenshot preview or placeholder.
   - Audio record/replay state or typed transcript fallback.
   - Explicit intent toggle/state only when user wording requests code assertion/verification.
5. **Floating bubble**
   - Android overlay surface for brief answer/status/agent notifications.
   - Tap should open the Flutter app to the related session or context request.

## Native Android capabilities needed later

| Capability | Android concern | Flutter boundary |
| --- | --- | --- |
| Floating overlay | `SYSTEM_ALERT_WINDOW`, foreground service/window manager | `MethodChannel` command: `startBubble`, `stopBubble`, `updateBubble` |
| Screenshot capture | MediaProjection consent flow + foreground service | `MethodChannel` command: `captureScreenshot` returns image/metadata for a context request |
| Audio capture | microphone permission, recording lifecycle, file encoding | Flutter plugin or `MethodChannel` command: `recordPrompt` returns audio metadata/transcript placeholder |
| Background event listening | foreground service or periodic reconnect rules | Native service can subscribe to App Server events and notify Flutter |
| Notifications | notification permission on recent Android versions | Native helper invoked from Flutter or service |

## State model

- `serverBaseUrl`: user-configured URL.
- `deviceId`: generated local device identifier.
- `sessions`: last fetched session list.
- `selectedSessionId`: current session.
- `currentContextDraft`: screenshot/audio/transcript draft before submit.
- `contextRequests`: submitted prompt requests and answer status.
- `eventStreamStatus`: disconnected / connecting / connected / retrying.

## Context request rules

- A context request should include screenshot information and an audio prompt whenever available.
- A typed transcript can substitute for audio during the demo.
- `intent: code_assertion` should be set only when the user's prompt explicitly asks for code assertion/verification.
- If intent is unclear, default to `context_question`.

## Open questions

- Will event listening live in Dart while app is foreground, native service while background, or both?
- Will first-demo audio use real recording, typed transcript, or both?
- Do we need screenshot upload to include full image bytes for demo, or is metadata/context enough?
- Should the bubble be always-on or only while a session/context request is active?
