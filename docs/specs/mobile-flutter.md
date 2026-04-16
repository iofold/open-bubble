# Mobile Flutter Spec

Flutter owns the normal app UI. The current MVP only needs the client to:

1. Check `GET /health`.
2. Send one image or video upload plus optional text to `POST /prompt`.
3. Render the synchronous JSON response.

Native Android work can stay deferred until the basic API flow is stable.
