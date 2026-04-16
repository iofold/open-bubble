# User Journeys

## Journey 1: Check server health

1. User opens the API locally or through the mobile app.
2. Client calls `GET /health`.
3. Client shows that the API is available.

## Journey 2: Submit a prompt

1. User selects one screenshot or screen recording file.
2. User adds a short text prompt, records a raw audio prompt, or sends both.
3. Client sends `screenMedia` plus at least one prompt field to `POST /prompt`.
4. API returns JSON immediately.
5. Client shows the answer and any media details it needs for display.
