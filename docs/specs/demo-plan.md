# Demo Plan

## Target story

1. Start the App Server.
2. Start or register a demo backend agent session.
3. Open Flutter app on Android.
4. Connect app to the App Server.
5. See active session in the app.
6. Open bubble overlay.
7. Send screenshot/context to the server.
8. Backend agent emits `agent.done`.
9. Bubble updates with the completion notification.
10. Tap bubble to return to the session detail screen.

## Demo data to prepare

- One fake/real session named `Hackathon Agent`.
- One context summary showing current task and recent files.
- One screenshot/context upload payload.
- One completion event payload.

## Fallback demo if native overlay is not ready

Use an in-app floating widget that behaves like the bubble while the platform-channel overlay is still under development.
