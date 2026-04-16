# Demo Storyboard

## Thesis

Open Bubble turns any screen into a context-aware question surface: capture what
the user sees, capture what they ask, send it to a small local backend, and show
an answer whose context can be inspected.

Keep the demo honest about the current boundary:

- The stable API MVP is `GET /health` and `POST /prompt`.
- `POST /prompt` accepts required `screenMedia` plus `promptText`, raw
  `promptAudio`, or both.
- The frontend forwards raw audio bytes; it does not transcribe audio.
- `apps/codex-agent` is the adjacent local context-graph workspace, not the
  production API dispatcher yet.
- The graph control panel is a local developer/operator inspection view, not the
  Android bubble surface.

## Hero Scenario

A teammate is using Open Bubble while an agent is working in the repo.

The user opens the bubble and asks:

> What is the agent working on right now?

Open Bubble captures:

1. screen context from the Android/Flutter surface,
2. prompt context from typed text or raw voice audio,
3. local project/session context from the Codex-agent graph,
4. optional connector context from backend-side Gmail, Drive, or Calendar
   snippets when relevant.

The answer explains the current agent work and can be traced back through the
local graph.

## Six-Minute Run of Show

| Time | Scene | Visual | Narration | Proof Point |
| --- | --- | --- | --- | --- |
| 0:00-0:20 | Cold open | Phone, emulator, or mock with the bubble affordance | "What if every screen had an ask button?" | Audience understands the product shape immediately. |
| 0:20-0:50 | Problem | Slide or verbal setup | "Assistants usually do not know what you are looking at, and project context lives elsewhere." | Establishes the gap. |
| 0:50-1:20 | Product concept | Simple architecture diagram | "Open Bubble sends screen media plus a prompt to a tiny local API, then routes toward local context intelligence." | Shows the MVP architecture. |
| 1:20-2:10 | API MVP proof | Terminal, API client, or Flutter client logs | Call `GET /health`, then send `POST /prompt` with screenshot plus text or audio. | Proves the current contract works. |
| 2:10-3:30 | Context answer path | `apps/codex-agent` script output or response JSON | Process the question: "What is the agent working on right now?" | Shows the richer local answer path. |
| 3:30-4:45 | Graph trace | Local graph control panel | Click the request, answer, screenshot, voice note, intent, and source fact nodes. | Demonstrates provenance and inspectability. |
| 4:45-5:25 | Connector story | Gmail, Drive, or Calendar filters in the graph | "Connector context stays backend/local; the Flutter app does not call these providers directly." | Shows privacy and boundary discipline. |
| 5:25-6:00 | Close | Architecture plus next-step slide | "Today is screen plus prompt into a local API. Next is API dispatch to the Codex-agent graph and the Flutter bubble." | Leaves a clear roadmap. |

## Presenter Script

### 1. Cold Open

"This is Open Bubble. Wherever I am on my phone, I can tap a bubble and ask a
question about what I am seeing. For the MVP, we are proving the smallest useful
loop: screen media plus a prompt goes to a local API and returns an answer."

If the Flutter surface is not demo-ready, use a phone mock or emulator screen and
move quickly to the working backend proof.

### 2. API Boundary

"The backend is intentionally tiny right now. It exposes health and prompt
endpoints. The prompt request includes required screen media and either text,
raw audio, or both. The client does not transcribe audio; it forwards the bytes."

From the repo root, the operator can start a reachable API with:

```bash
./scripts/start-api-ngrok.sh
```

The frontend reads `OPEN_BUBBLE_API_BASE_URL` from the repo-level `.env` and uses
it for:

- `GET /health`
- `POST /prompt`

A simple local proof can use a multipart request shaped like:

```bash
curl -X POST "$OPEN_BUBBLE_API_BASE_URL/prompt" \
  -F "screenMedia=@/tmp/demo-screenshot.png;type=image/png" \
  -F "promptText=What should I do next?"
```

### 3. Context Answer Path

"Next to the API, we have a Codex-agent workspace. This is where richer context
graph experiments live. It can ingest screenshot-plus-prompt requests, store
context in DuckDB, and produce a structured answer."

Use the hero question:

> What is the agent working on right now?

Show the request fixture or prepared request, then show the resulting
`ContextAnswer` JSON.

### 4. Graph Control Panel

"The important thing is that the answer is not just magic text. The control
panel shows what the agent knows, where facts came from, and why an answer was
generated. This panel is for developers and demo operators; it is not the
consumer Android UI."

Suggested click path:

1. open the graph control panel for `sess_test_001`,
2. focus the latest context request,
3. click the generated answer,
4. inspect the screenshot and voice-note nodes,
5. follow the answer trace back to source facts or seed context,
6. filter connector nodes if Gmail, Drive, or Calendar fixture data is loaded.

### 5. Connector Boundary

"Gmail, Drive, and Calendar are backend/local context sources. The Flutter app
should not call those providers directly. Connector-derived snippets are
minimized, stored with provenance, and inspectable through the graph."

Use fixture connector data unless live MCP connectors are intentionally part of
the demo.

### 6. Close

"The demo arc is: from any screen, ask a question; the app sends screen media
plus prompt to a small API; local context intelligence answers; and the graph
shows why. The next step is wiring the stable API path directly into the
Codex-agent workspace and then into the Flutter Android bubble."

Close with:

> Open Bubble is a context-aware question button for whatever is on your screen.

## Operator Checklist

Before the demo:

- Prepare a screenshot or screen recording file.
- Prepare a fallback text prompt: `What is the agent working on right now?`
- Prepare optional raw audio if the audio path is being shown.
- Start the local API or ngrok tunnel.
- Seed the Codex-agent graph with deterministic test context.
- Open the graph control panel to `sess_test_001`.
- Keep a static exported graph JSON available as fallback.

Useful commands from `apps/codex-agent`:

```bash
./scripts/seed-context-graph.py --db /tmp/open-bubble-context.duckdb --reset
./scripts/ingest-mcp-results.py --db /tmp/open-bubble-context.duckdb --input testdata/mcp-gmail-results.json
./scripts/ingest-mcp-results.py --db /tmp/open-bubble-context.duckdb --input testdata/mcp-drive-results.json
./scripts/ingest-mcp-results.py --db /tmp/open-bubble-context.duckdb --input testdata/mcp-calendar-results.json
./scripts/export-context-graph.py \
  --db /tmp/open-bubble-context.duckdb \
  --session-id sess_test_001 \
  --out control-panel/graph.sample.json
```

For the live graph server path:

```bash
./scripts/context-graph-server.py \
  --db data/demo-context.duckdb \
  --host tailscale \
  --port 8788
```

Then open:

```text
http://<tailscale-ip>:8788/control-panel?sessionId=sess_test_001
```

## Fallbacks

| Risk | Fallback |
| --- | --- |
| Flutter UI is not ready | Use a phone mock or emulator screenshot, then show the API and graph proof. |
| Audio capture fails | Use `promptText` and state that raw audio is supported by the API contract. |
| `ngrok` fails | Demo against localhost or emulator networking. |
| Live graph server fails | Load exported static graph JSON in the control panel. |
| Connector integrations are not live | Use fixture Gmail, Drive, and Calendar data and label it clearly as fixture context. |
| API-to-Codex dispatch is not wired | State that the context graph is the adjacent local path and API dispatch wiring is next. |

## Success Criteria

The demo succeeds if the audience understands:

1. Open Bubble is a floating mobile question surface for the current screen.
2. The MVP API accepts screen media plus text or raw audio and returns JSON.
3. The local Codex-agent graph can turn a context request into a richer answer.
4. The graph control panel makes the answer inspectable through provenance and
   trace data.

## Safe Claims

Use these claims in the demo:

- "The API MVP supports `GET /health` and `POST /prompt`."
- "The frontend sends raw prompt audio; it does not transcribe on-device."
- "The Codex-agent workspace can ingest demo context into a local graph."
- "The control panel is a local operator/debugging view."
- "Connector context should stay backend/local and provenance-linked."

Avoid these claims until the implementation catches up:

- "The production API already dispatches every prompt to Codex-agent."
- "The Android bubble is the graph control panel."
- "Gmail, Drive, and Calendar are called directly by the Flutter app."
- "The system automatically creates code assertions without explicit user
  wording."
