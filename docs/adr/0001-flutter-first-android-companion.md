# ADR 0001: Use Flutter for the mobile companion app

## Status

Accepted for hackathon scaffold.

## Context

AM / Aaditya is more familiar with Flutter, and the mobile app needs quick iteration on UI while still reaching Android-specific capabilities such as overlays and screenshot capture.

## Decision

Build the mobile companion as a Flutter Android app. Keep OS-specific Android functions behind a narrow platform-channel boundary.

## Consequences

- Flutter can own normal app screens and state quickly.
- Native Android code is still needed for system overlay, foreground service, notification, and MediaProjection screenshot flows.
- The team should avoid adding Flutter packages until the MVP proves it needs them.
- The API contract should be stable before mobile/server implementation begins.
