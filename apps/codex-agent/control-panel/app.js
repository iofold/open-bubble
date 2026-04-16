const graphEl = document.getElementById("graph");
const fileInput = document.getElementById("fileInput");
const searchInput = document.getElementById("searchInput");
const connectorFilters = document.getElementById("connectorFilters");
const typeFilters = document.getElementById("typeFilters");
const inspectorContent = document.getElementById("inspectorContent");
const statsEl = document.getElementById("stats");
const sessionLabel = document.getElementById("sessionLabel");
const fitButton = document.getElementById("fitButton");
const resetButton = document.getElementById("resetButton");

const TYPE_COLORS = {
  agent_session: "#4ea1ff",
  context_request: "#7dd3fc",
  answer: "#52c48b",
  frontend_device: "#38bdf8",
  screenshot_observation: "#60a5fa",
  voice_note: "#22d3ee",
  screen_app: "#67e8f9",
  task: "#93c5fd",
  file: "#c4b5fd",
  claim: "#e5b454",
  gmail_thread: "#ef6262",
  gmail_message: "#f87171",
  drive_file: "#4fbd7a",
  drive_folder: "#86efac",
  document_section: "#bbf7d0",
  calendar_event: "#a78bfa",
  person: "#facc15",
  organization: "#2dd4bf",
  attachment: "#fda4af",
  time_anchor: "#c084fc",
};

let graphData = { sessionId: "", nodes: [], edges: [], episodes: [], stats: {} };
let selected = null;
let activeTypes = new Set();
let activeConnectors = new Set();
let transform = { x: 0, y: 0, scale: 1 };
let graphStream = null;

function sessionIdFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("sessionId") || "sess_test_001";
}

function connectorOf(node) {
  return node.metadata?.connector || (node.isEpisode ? "local" : "local");
}

function colorOf(node) {
  const connector = connectorOf(node);
  if (connector === "gmail") return TYPE_COLORS[node.type] || "#ef6262";
  if (connector === "drive") return TYPE_COLORS[node.type] || "#4fbd7a";
  if (connector === "calendar") return TYPE_COLORS[node.type] || "#a78bfa";
  return TYPE_COLORS[node.type] || "#94a3b8";
}

function filteredGraph() {
  const query = searchInput.value.trim().toLowerCase();
  const nodes = graphData.nodes.filter((node) => {
    if (activeTypes.size && !activeTypes.has(node.type)) return false;
    if (activeConnectors.size && !activeConnectors.has(connectorOf(node))) return false;
    if (!query) return true;
    return [node.id, node.type, node.label, node.description, JSON.stringify(node.metadata || {})]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graphData.edges.filter((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return false;
    if (!query) return true;
    return [edge.type, edge.label, edge.sourceEpisodeId, JSON.stringify(edge.metadata || {})]
      .join(" ")
      .toLowerCase()
      .includes(query) || ids.has(edge.source) || ids.has(edge.target);
  });
  return { nodes, edges };
}

function layout(nodes, edges) {
  const width = graphEl.clientWidth || 800;
  const height = graphEl.clientHeight || 600;
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  return nodes.map((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    const ring = 120 + (index % 5) * 38;
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * ring,
      y: height / 2 + Math.sin(angle) * ring,
      r: Math.min(18, 7 + Math.sqrt(degree.get(node.id) || 0) * 3 + (node.isEpisode ? 3 : 0)),
    };
  });
}

function render() {
  const { nodes, edges } = filteredGraph();
  const placed = layout(nodes, edges);
  const byId = new Map(placed.map((node) => [node.id, node]));
  graphEl.innerHTML = "";
  graphEl.setAttribute("viewBox", `${-transform.x} ${-transform.y} ${graphEl.clientWidth / transform.scale} ${graphEl.clientHeight / transform.scale}`);

  const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  graphEl.append(edgeGroup, nodeGroup);

  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", source.x);
    line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x);
    line.setAttribute("y2", target.y);
    line.setAttribute("class", `edge ${selected?.id === edge.id ? "selected" : ""}`);
    line.addEventListener("click", () => {
      selected = edge;
      inspectEdge(edge);
      render();
    });
    edgeGroup.append(line);
  }

  for (const node of placed) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", node.r);
    circle.setAttribute("fill", colorOf(node));
    circle.setAttribute("class", `node ${selected?.id === node.id ? "selected" : ""}`);
    circle.addEventListener("click", () => {
      selected = node;
      inspectNode(node);
      render();
    });
    nodeGroup.append(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", node.x + node.r + 4);
    label.setAttribute("y", node.y + 4);
    label.setAttribute("class", "label");
    label.textContent = node.label.length > 34 ? `${node.label.slice(0, 31)}...` : node.label;
    nodeGroup.append(label);
  }

  renderStats(nodes, edges);
}

function renderCheckboxes(container, values, activeSet, colorFn) {
  container.innerHTML = "";
  for (const value of values) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = activeSet.has(value);
    input.addEventListener("change", () => {
      if (input.checked) activeSet.add(value);
      else activeSet.delete(value);
      render();
    });
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colorFn(value);
    const text = document.createElement("span");
    text.textContent = value.replace(/_/g, " ");
    label.append(input, swatch, text);
    container.append(label);
  }
}

function renderFilters() {
  const types = Array.from(new Set(graphData.nodes.map((node) => node.type))).sort();
  const connectors = Array.from(new Set(graphData.nodes.map(connectorOf))).sort();
  activeTypes = new Set(types);
  activeConnectors = new Set(connectors);
  renderCheckboxes(typeFilters, types, activeTypes, (type) => TYPE_COLORS[type] || "#94a3b8");
  renderCheckboxes(connectorFilters, connectors, activeConnectors, (connector) => ({
    gmail: "#ef6262",
    drive: "#4fbd7a",
    calendar: "#a78bfa",
    local: "#4ea1ff",
  })[connector] || "#94a3b8");
}

function renderStats(nodes, edges) {
  const stats = [
    ["Visible nodes", nodes.length],
    ["Visible edges", edges.length],
    ["All nodes", graphData.nodes.length],
    ["All edges", graphData.edges.length],
    ["Episodes", graphData.episodes.length],
  ];
  statsEl.innerHTML = stats.map(([key, value]) => `<div class="stat"><span>${key}</span><strong>${value}</strong></div>`).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inspectNode(node) {
  const outgoing = graphData.edges.filter((edge) => edge.source === node.id);
  const incoming = graphData.edges.filter((edge) => edge.target === node.id);
  inspectorContent.className = "detail";
  inspectorContent.innerHTML = `
    <span class="pill">${escapeHtml(node.type)}</span>
    <h3>${escapeHtml(node.label)}</h3>
    <p>${escapeHtml(node.description || "No description.")}</p>
    <section class="kv">
      <div><strong>Connector</strong>${escapeHtml(connectorOf(node))}</div>
      <div><strong>Outgoing</strong>${outgoing.map((edge) => escapeHtml(edge.type)).join(", ") || "None"}</div>
      <div><strong>Incoming</strong>${incoming.map((edge) => escapeHtml(edge.type)).join(", ") || "None"}</div>
      <div><strong>Metadata</strong><pre>${escapeHtml(JSON.stringify(node.metadata || {}, null, 2))}</pre></div>
    </section>
  `;
}

function inspectEdge(edge) {
  inspectorContent.className = "detail";
  inspectorContent.innerHTML = `
    <span class="pill">${escapeHtml(edge.type)}</span>
    <h3>${escapeHtml(edge.label)}</h3>
    <section class="kv">
      <div><strong>Source</strong>${escapeHtml(edge.source)}</div>
      <div><strong>Target</strong>${escapeHtml(edge.target)}</div>
      <div><strong>Confidence</strong>${escapeHtml(edge.confidence ?? "")}</div>
      <div><strong>Source episode</strong>${escapeHtml(edge.sourceEpisodeId || "None")}</div>
      <div><strong>Metadata</strong><pre>${escapeHtml(JSON.stringify(edge.metadata || {}, null, 2))}</pre></div>
    </section>
  `;
}

async function loadGraphData(payload) {
  graphData = {
    sessionId: payload.sessionId || "",
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    edges: Array.isArray(payload.edges) ? payload.edges : [],
    episodes: Array.isArray(payload.episodes) ? payload.episodes : [],
    stats: payload.stats || {},
  };
  selected = null;
  sessionLabel.textContent = graphData.sessionId ? `Session ${graphData.sessionId}` : "No session id";
  renderFilters();
  render();
}

async function loadLiveGraph() {
  const sessionId = sessionIdFromLocation();
  const response = await fetch(`/context-graph?sessionId=${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error(`Graph request failed: ${response.status}`);
  await loadGraphData(await response.json());
}

function connectGraphStream() {
  if (!window.EventSource) return;
  const sessionId = sessionIdFromLocation();
  if (graphStream) graphStream.close();
  graphStream = new EventSource(`/context-graph/stream?sessionId=${encodeURIComponent(sessionId)}`);
  graphStream.addEventListener("graph.snapshot", (event) => {
    loadGraphData(JSON.parse(event.data));
  });
  graphStream.onerror = () => {
    sessionLabel.textContent = `${sessionLabel.textContent} (live stream disconnected)`;
  };
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  await loadGraphData(JSON.parse(text));
});

searchInput.addEventListener("input", render);
fitButton.addEventListener("click", () => {
  transform = { x: 0, y: 0, scale: 1 };
  render();
});
resetButton.addEventListener("click", () => {
  searchInput.value = "";
  selected = null;
  renderFilters();
  inspectorContent.className = "empty";
  inspectorContent.textContent = "Select a node or edge.";
  render();
});

window.addEventListener("resize", render);

loadLiveGraph()
  .then(connectGraphStream)
  .catch(() => {
    fetch("./graph.sample.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload) loadGraphData(payload);
      })
      .catch(() => {
        renderStats([], []);
      });
  });
