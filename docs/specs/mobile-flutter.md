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
   - Show context summary from `GET /v1/sessions/{sessionId}/context`.
   - Trigger screenshot/context send.
4. **Floating bubble**
   - Android overlay surface for brief agent notifications.
   - Tap should open the Flutter app to the related session.

## Native Android capabilities needed later

| Capability | Android concern | Flutter boundary |
| --- | --- | --- |
| Floating overlay | `SYSTEM_ALERT_WINDOW`, foreground service/window manager | `MethodChannel` command: `startBubble`, `stopBubble`, `updateBubble` |
| Screenshot capture | MediaProjection consent flow + foreground service | `MethodChannel` command: `captureScreenshot` returns local metadata/upload result |
| Background event listening | foreground service or periodic reconnect rules | Native service can subscribe to App Server events and notify Flutter |
| Notifications | notification permission on recent Android versions | Native helper invoked from Flutter or service |

## State model

- `serverBaseUrl`: user-configured URL.
- `deviceId`: generated local device identifier.
- `sessions`: last fetched session list.
- `selectedSessionId`: current session.
- `eventStreamStatus`: disconnected / connecting / connected / retrying.

## Open questions

- Will event listening live in Dart while app is foreground, native service while background, or both?
- Do we need screenshot upload to include full image bytes for demo, or is metadata/context enough?
- Should the bubble be always-on or only while a session is active?
