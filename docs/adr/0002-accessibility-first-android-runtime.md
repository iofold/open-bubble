# ADR 0002: Use an accessibility-first Android runtime for Open Bubble

## Status

Accepted for the hackathon MVP.

## Context

Open Bubble needs to stay available while the app is backgrounded, inspect the active Android UI, capture screen context repeatedly, and fill reviewed text back into another app.

The earlier mobile outline assumed:

- `SYSTEM_ALERT_WINDOW` for the floating bubble
- MediaProjection for screenshots

That approach creates the wrong UX for the MVP:

- MediaProjection introduces repeated consent friction for recurring captures.
- Application overlays add a second permission surface that is not needed if accessibility is already core.
- The core MVP requirement is accessibility-driven read/write, not generic screen recording.

## Decision

Build the Android runtime around `AccessibilityService`.

- Use `TYPE_ACCESSIBILITY_OVERLAY` for the floating bubble.
- Use accessibility window inspection as the primary source of screen context.
- Use `AccessibilityService.takeScreenshot()` / `takeScreenshotOfWindow()` for captures instead of MediaProjection.
- Use Flutter only for onboarding, session UI, review UI, and server/mock orchestration.
- Keep all privileged Android operations behind a narrow platform-channel boundary.

## Consequences

### Positive

- One permission path instead of two.
- Better repeat-use UX for inspect / capture / fill flows.
- Bubble, read, and write behavior all live in the same Android privilege model.

### Negative

- Accessibility onboarding is heavy and explicit.
- Some apps and screens will remain partial failures.
- Secure and sensitive screens must be treated as unsupported.
- Play policy and disclosure requirements become a major product concern if distribution expands.

## Follow-ups

- Update the mobile spec and API contract around accessibility captures and review-before-fill.
- Raise the Android minimum SDK for the mobile app to API 30.
- Build mocked request/result flows first, then integrate with the real App Server.
