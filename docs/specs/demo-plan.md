# Demo Plan

## Target story

1. Start the App Server.
2. Start or register a demo backend agent session.
3. Open Flutter app on Android.
4. Connect app to the App Server.
5. See active session in the app.
6. Open bubble overlay.
7. Send screenshot + audio/typed prompt to the server as a context request.
8. Backend adapter answers from local directory context and emits `context.answer.ready`.
9. Bubble updates with the context answer, then later the completion notification.
10. Tap bubble to return to the session detail screen.

## Demo data to prepare

- One fake/real session named `Hackathon Agent`.
- One context request payload with screenshot metadata and audio/typed prompt.
- One local-directory-backed answer payload.
- One completion event payload.

## Fallback demo if native overlay is not ready

Use an in-app floating widget that behaves like the bubble while the platform-channel overlay is still under development. Use typed transcript and screenshot metadata placeholders if native audio/screenshot capture is not ready.
