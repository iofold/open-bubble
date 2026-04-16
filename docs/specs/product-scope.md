# Product Scope

## Problem

When backend agents are running, it is hard to quickly inspect their state, give them phone context, or notice when they finish without switching tools. Open Bubble gives the phone a lightweight companion surface for agent context and notifications.

## Users

- **Primary:** the hackathon team demoing agent workflows from an Android device.
- **Secondary:** developers running one or more local/backend agents who want quick context capture and status notifications.

## MVP goals

1. Flutter Android app can connect to a configurable App Server URL.
2. User can view active backend sessions/agents.
3. User can request or view a session context summary.
4. User can inspect the active screen and trigger accessibility-based screenshot/context capture from the phone side.
5. App Server can emit request status and agent status/completion events.
6. Mobile app can show those events in an accessibility overlay bubble on Android.
7. User can review a suggested reply locally before filling it into another app.

## Non-goals for hackathon MVP

- App-store-ready compliance or policy work.
- Full auth, multi-tenant accounts, or production-grade secret handling.
- Durable cloud persistence.
- Perfect cross-platform Flutter support; Android is the priority.
- Silent autonomous actions inside third-party apps without explicit user review.

## Success criteria

- A teammate can run the server and mobile app from a fresh checkout with documented steps.
- Mobile/server agree on the OpenAPI contract before feature work starts.
- Demo can show: active session list → active-screen inspect → screenshot/context send → backend/mock result → review → fill or copy.
- Each teammate has a clear ownership lane with limited merge conflicts.
