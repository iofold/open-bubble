# User Journeys

## Journey 1: Check server health

1. User opens the API locally or through the mobile app.
2. Client calls `GET /health`.
3. Client shows that the API is available.

## Journey 2: Submit a prompt

1. User selects one image or video file.
2. User optionally adds a short text prompt.
3. Client sends both fields to `POST /prompt`.
4. API returns JSON immediately.
5. Client shows the answer and any media details it needs for display.
