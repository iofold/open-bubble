# Mobile Flutter Spec

The mobile app is a Flutter Android app with a native Android accessibility runtime.

- Flutter owns onboarding, server configuration, setup status, request history, and review UI.
- Native Android owns the `AccessibilityService`, accessibility overlay bubble, prompt composer overlay, screenshot capture, notifications, clipboard updates, and focused-field fill.
- The Flutter/native boundary stays narrow. The background flow must continue to work while the Flutter activity is not foregrounded.

## Platform strategy

- Android only for the hackathon MVP.
- `minSdk 30` so the app can rely on `AccessibilityService.takeScreenshot()` without MediaProjection.
- Optimize behavior for API 34+ where window-targeted screenshot capture is cleaner.

## Real API flow

The active client/server contract is:

1. `GET /health`
2. `POST /prompt`
3. `GET /tasks/{taskId}`

`POST /prompt` uses `multipart/form-data` with:

- `screenMedia`: required `image/*` or `video/*`
- `promptText`: optional text field
- `promptAudio`: optional raw `audio/*` file

At least one of `promptText` or `promptAudio` must be present. For the current Android client milestone, only `screenMedia` plus `promptText` is required.

## Mobile surfaces

1. **Setup screen**
   - Explain why accessibility access is required.
   - Send the user to Accessibility Settings.
   - Configure the App Server base URL.
   - Confirm accessibility, notification, and server health status.
2. **Request history / review**
   - Show the latest captured screen metadata.
   - Show the latest request state and server answer.
   - Allow `Copy`, `Fill`, or `Cancel`.
3. **Floating bubble**
   - Native accessibility overlay bubble that remains available while the app is backgrounded.
   - Tap opens a compact action panel.
   - Long press opens a prompt composer for the current screen.
4. **Prompt composer overlay**
   - Collect the user’s explicit text prompt while the current app remains visible underneath.
   - On send, capture the current screen and submit `screenMedia` plus `promptText` to the App Server.
   - Poll `GET /tasks/{taskId}` until the task reaches `completed`, `failed`, or `error`.
   - Copy the completed answer to the clipboard and post a notification.

## Native Android capabilities

| Capability | Android concern | Flutter boundary |
| --- | --- | --- |
| Accessibility bubble | `TYPE_ACCESSIBILITY_OVERLAY` inside `AccessibilityService` | `showBubble`, `hideBubble`, `getServiceStatus` |
| Prompt composer overlay | focus, IME, and lifecycle while another app is foregrounded | event stream plus persisted server base URL |
| Active window inspection | stale trees, multi-window, focused node resolution | `inspectActiveWindow` |
| Screenshot capture | API 30+ screenshot support, secure-window failures, capture throttling | `capture.ready` / `capture.failed` events |
| Prompt upload | cleartext dev URLs, multipart validation, background threading | persisted server URL, task events |
| Task polling | network failure, retry limits, task error states | `task.accepted`, `task.completed`, `task.failed` events |
| Text fill | `ACTION_SET_TEXT`, `ACTION_PASTE`, focus fallback | `fillFocusedField`, `copyText` |
| Settings handoff | user must explicitly enable service in Settings | `openAccessibilitySettings` |

## Flutter/native bridge contract

### Methods

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

### Event stream

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

## Required UX safeguards

- The app must never silently submit data to a remote server without an explicit user action.
- The app must never silently fill remote-generated text into another app.
- The app must always show a local review state after a remote answer arrives, even if the clipboard was already updated.
- The app must clearly explain when a screen cannot be read or captured.
- The app must degrade gracefully on secure or unsupported surfaces.
