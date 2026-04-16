# Product Scope

## Problem

When backend agents are running, it is hard to ask them quick phone-context questions, show them what is on the Android screen, or notice when they finish without switching tools. Open Bubble gives the phone a lightweight companion surface for screenshot + audio prompts, local-directory-backed answers, and agent notifications.

## Users

- **Primary:** the hackathon team demoing agent workflows from an Android device.
- **Secondary:** developers running one or more local/backend agents who want quick context capture, local-repo-aware answers, and status notifications.

## MVP goals

1. Flutter Android app can connect to a configurable App Server URL.
2. User can view active backend sessions/agents.
3. User can submit a screenshot + audio/typed prompt for a selected session.
4. Backend can answer that prompt using context maintained in the local directory for the session.
5. User can explicitly request an outgoing code assertion/verification when needed.
6. App Server can emit answer/status/completion events.
7. Mobile app can show those events in an overlay/floating bubble on Android.

## Non-goals for hackathon MVP

- App-store-ready permission UX.
- Full auth, multi-tenant accounts, or production-grade secret handling.
- Durable cloud persistence.
- Perfect cross-platform Flutter support; Android is the priority.
- Fully general voice assistant behavior unrelated to the selected local directory/session.
- Automatic code assertion when the user did not explicitly request it.
- Deep bidirectional remote-control of arbitrary agents beyond small demo actions.

## Success criteria

- A teammate can run the server and mobile app from a fresh checkout with documented steps.
- Mobile/server agree on the OpenAPI contract before feature work starts.
- Demo can show: active session list → screenshot + audio prompt → local-directory-backed answer → backend event → bubble notification.
- Code assertion/verification only appears when the user's prompt explicitly requests it.
- Each teammate has a clear ownership lane with limited merge conflicts.
