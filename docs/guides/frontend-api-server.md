# Frontend API Server Guide

Use the top-level launcher when the Flutter frontend needs a reachable API server from another device or emulator.

## One command

Run this from the repository root:

```bash
./scripts/start-api-ngrok.sh
```

The command:

1. Installs `apps/api` dependencies if they are missing.
2. Starts the local Fastify API server.
3. Starts an `ngrok` HTTP tunnel to that API server.
4. Prints the public `ngrok` URL.
5. Creates or updates `OPEN_BUBBLE_API_BASE_URL` in the repo-level `.env` file without removing any other entries.

The launcher keeps the API server and `ngrok` running until you stop it with `Ctrl+C`.

## Local setup

- Install the `ngrok` CLI.
- Either run `ngrok config add-authtoken <token>` once, or add `NGROK_AUTHTOKEN=<token>` to the repo-level `.env`.

`.env.example` shows the expected local variables. Do not commit your real `.env`.

## Frontend contract

The frontend reads `OPEN_BUBBLE_API_BASE_URL` from the repo-level `.env` and uses that as the base URL for:

- `GET /health`
- `POST /prompt`

`POST /prompt` must be sent as `multipart/form-data` with:

- required `screenMedia`
- optional `promptText`
- optional raw `promptAudio`
- at least one of `promptText` or `promptAudio`

The frontend must forward raw `promptAudio` bytes as-is. Do not transcribe audio on the client.

## Flutter request shape

```dart
final request = http.MultipartRequest(
  'POST',
  Uri.parse('$apiBaseUrl/prompt'),
)
  ..files.add(await http.MultipartFile.fromPath('screenMedia', screenPath))
  ..fields['promptText'] = 'What should I do next?';

if (promptAudioPath != null) {
  request.files.add(
    await http.MultipartFile.fromPath('promptAudio', promptAudioPath),
  );
}

final response = await request.send();
```

Use the same `apiBaseUrl` value for `GET $apiBaseUrl/health` when the frontend wants a quick connectivity check.
