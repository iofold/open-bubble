# Mobile Flutter Spec

## Scope

The mobile app is a Flutter Android app with a native Android accessibility runtime.

- Flutter owns onboarding, connection state, session browsing, review UI, and mocked server flows during early development.
- Native Android owns the `AccessibilityService`, accessibility overlay bubble, active-window inspection, screenshot capture, and text-fill actions.
- The Flutter/native boundary should stay narrow and explicit.

## Platform strategy

- Android only for the hackathon MVP.
- `minSdk 30` so the app can rely on `AccessibilityService.takeScreenshot()` without MediaProjection.
- Optimize behavior for API 34+ where window-targeted screenshot capture is cleaner.

## Mobile surfaces

1. **Setup screen**
   - Explain why accessibility access is required.
   - Send the user to Accessibility Settings.
   - Confirm service connectivity and surface restricted-settings troubleshooting.
2. **Connection screen**
   - Configure App Server base URL.
   - Show connection health.
   - Allow switching between mocked responses and real server wiring later.
3. **Sessions screen**
   - List active sessions from `GET /v1/sessions`.
   - Open a session detail view.
4. **Session detail**
   - Show context summary from `GET /v1/sessions/{sessionId}/context`.
   - Show most recent capture, pending request state, and latest reply.
5. **Review / action sheet**
   - Preview the content that will be filled into another app.
   - Allow `Fill`, `Copy`, or `Cancel`.
6. **Floating bubble**
   - Native accessibility overlay bubble that remains available while the app is backgrounded.
   - Tap opens the app.
   - Long press is reserved for capture / inspect flows.

## Native Android capabilities

| Capability | Android concern | Flutter boundary |
| --- | --- | --- |
| Accessibility bubble | `TYPE_ACCESSIBILITY_OVERLAY` inside `AccessibilityService` | `showBubble`, `hideBubble`, `getServiceStatus` |
| Active window inspection | stale trees, multi-window, focused node resolution | `inspectActiveWindow` |
| Screenshot capture | API 30+ screenshot support, secure-window failures, capture throttling | `captureActiveWindow` |
| Text fill | `ACTION_SET_TEXT`, `ACTION_PASTE`, focus fallback | `fillFocusedField`, `copyText` |
| Settings handoff | user must explicitly enable service in Settings | `openAccessibilitySettings` |
| Runtime events | service lifecycle, overlay events, capture completion | event stream from native to Flutter |

## Flutter/native bridge contract

### Methods

- `getServiceStatus`
- `openAccessibilitySettings`
- `showBubble`
- `hideBubble`
- `inspectActiveWindow`
- `captureActiveWindow`
- `fillFocusedField`
- `copyText`

### Event stream

- `service.connected`
- `service.disconnected`
- `bubble.shown`
- `bubble.hidden`
- `bubble.longPress`
- `inspection.ready`
- `capture.ready`
- `capture.failed`
- `fill.completed`
- `fill.failed`

## State model

- `serverBaseUrl`: user-configured URL.
- `useMockServer`: whether mocked request/response flows are active.
- `deviceId`: generated local device identifier.
- `sessions`: last fetched or mocked session list.
- `selectedSessionId`: current session.
- `eventStreamStatus`: disconnected / connecting / connected / retrying.
- `serviceStatus`: enabled / connected / overlayVisible / captureSupported.
- `latestInspection`: most recent accessibility window snapshot.
- `latestCapture`: most recent screenshot/capture metadata.
- `pendingRequestId`: request currently waiting on server/mock result.
- `draftFillSuggestion`: text proposed for user approval before fill.

## Required UX safeguards

- The app must never silently fill remote-generated text into another app.
- The app must always show a local preview step before a fill action.
- The app must clearly explain when a screen cannot be read or captured.
- The app must degrade gracefully on secure or unsupported surfaces.

## Open questions

- Should the bubble be always on, or only after the user selects a session?
- Should long press immediately capture, or open a tiny action menu first?
- What minimum metadata must be included in a capture submission for the server to route it correctly?
