import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import type { Connector, GraphEdge, GraphNode, GraphSnapshot, Selection } from './types';

const apiBase = (import.meta.env.VITE_OPEN_BUBBLE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

const connectorColor: Record<Connector, string> = {
  local: '#3b82f6',
  gmail: '#dc2626',
  drive: '#16a34a',
  calendar: '#7c3aed'
};

const typeColor: Record<string, string> = {
  agent_session: '#2563eb',
  context_request: '#0284c7',
  frontend_device: '#0891b2',
  screenshot_observation: '#0ea5e9',
  voice_note: '#06b6d4',
  screen_app: '#14b8a6',
  user_intent: '#64748b',
  task: '#4f46e5',
  file: '#8b5cf6',
  claim: '#ca8a04',
  gmail_thread: '#dc2626',
  gmail_message: '#ef4444',
  drive_file: '#16a34a',
  drive_folder: '#22c55e',
  document_section: '#4ade80',
  calendar_event: '#7c3aed',
  person: '#d97706',
  organization: '#0f766e',
  attachment: '#be123c',
  location: '#9333ea',
  time_anchor: '#a855f7'
};

const emptyGraph: GraphSnapshot = {
  sessionId: '',
  nodes: [],
  edges: [],
  episodes: [],
  stats: {
    nodeCount: 0,
    edgeCount: 0,
    episodeCount: 0,
    chunkCount: 0
  }
};

const apiUrl = (path: string): string => `${apiBase}${path}`;

const connectorOf = (node: GraphNode): Connector => {
  const raw = node.metadata?.['connector'];
  return raw === 'gmail' || raw === 'drive' || raw === 'calendar' ? raw : 'local';
};

const colorOf = (node: GraphNode): string =>
  typeColor[node.type] ?? connectorColor[connectorOf(node)];

const textValue = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

const sortText = (items: string[]): string[] =>
  Array.from(new Set(items)).sort((left, right) => left.localeCompare(right));

const searchTextForNode = (node: GraphNode): string =>
  [node.id, node.type, node.label, node.description, JSON.stringify(node.metadata ?? {})]
    .join(' ')
    .toLowerCase();

const searchTextForEdge = (edge: GraphEdge): string =>
  [edge.id, edge.type, edge.label, edge.source, edge.target, edge.sourceEpisodeId, JSON.stringify(edge.metadata ?? {})]
    .join(' ')
    .toLowerCase();

const hashAngle = (id: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
};

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: Selection;
  onSelect: (selection: Selection) => void;
}

function GraphCanvas({ nodes, edges, selected, onSelect }: GraphCanvasProps) {
  const width = 1200;
  const height = 780;
  const centerX = width / 2;
  const centerY = height / 2;
  const degrees = useMemo(() => {
    const result = new Map<string, number>();
    for (const node of nodes) result.set(node.id, 0);
    for (const edge of edges) {
      result.set(edge.source, (result.get(edge.source) ?? 0) + 1);
      result.set(edge.target, (result.get(edge.target) ?? 0) + 1);
    }
    return result;
  }, [edges, nodes]);
  const positions = useMemo(() => {
    const grouped = new Map<Connector, GraphNode[]>();
    for (const node of nodes) {
      const connector = connectorOf(node);
      grouped.set(connector, [...(grouped.get(connector) ?? []), node]);
    }
    const anchors: Record<Connector, { x: number; y: number }> = {
      local: { x: centerX - 190, y: centerY - 30 },
      gmail: { x: centerX + 260, y: centerY - 190 },
      drive: { x: centerX + 270, y: centerY + 145 },
      calendar: { x: centerX - 210, y: centerY + 190 }
    };
    const result = new Map<string, { x: number; y: number }>();
    for (const [connector, group] of grouped.entries()) {
      const anchor = anchors[connector];
      const sorted = [...group].sort((left, right) => left.id.localeCompare(right.id));
      sorted.forEach((node, index) => {
        const ring = Math.floor(index / 12);
        const radius = 56 + ring * 70 + Math.sqrt(degrees.get(node.id) ?? 0) * 10;
        const angle = hashAngle(node.id) + index * 0.52;
        result.set(node.id, {
          x: anchor.x + Math.cos(angle) * radius,
          y: anchor.y + Math.sin(angle) * radius
        });
      });
    }
    return result;
  }, [centerX, centerY, degrees, nodes]);

  return (
    <svg className="graphCanvas" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Context graph">
      <defs>
        <marker id="edgeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(100, 116, 139, 0.58)" />
        </marker>
      </defs>
      <rect className="graphBackplate" x="0" y="0" width={width} height={height} rx="0" />
      {edges.map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) return null;
        const active = selected?.kind === 'edge' && selected.value.id === edge.id;
        return (
          <g key={edge.id} className={active ? 'edge active' : 'edge'} onClick={() => onSelect({ kind: 'edge', value: edge })}>
            <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd="url(#edgeArrow)" />
          </g>
        );
      })}
      {nodes.map((node) => {
        const position = positions.get(node.id);
        if (!position) return null;
        const degree = degrees.get(node.id) ?? 0;
        const radius = Math.min(22, 9 + Math.sqrt(degree) * 3 + (node.isEpisode ? 3 : 0));
        const active = selected?.kind === 'node' && selected.value.id === node.id;
        return (
          <g key={node.id} className={active ? 'node active' : 'node'} transform={`translate(${position.x} ${position.y})`} onClick={() => onSelect({ kind: 'node', value: node })}>
            <circle r={radius + 5} className="nodeHalo" />
            <circle r={radius} fill={colorOf(node)} />
            <text x={radius + 8} y="5">{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface FilterListProps {
  title: string;
  items: string[];
  active: Set<string>;
  colorFor?: (item: string) => string;
  onToggle: (item: string) => void;
}

function FilterList({ title, items, active, colorFor, onToggle }: FilterListProps) {
  return (
    <section className="filterBlock">
      <h2>{title}</h2>
      <div className="checkList">
        {items.map((item) => (
          <label key={item} className="checkRow">
            <input type="checkbox" checked={active.has(item)} onChange={() => onToggle(item)} />
            <span className="swatch" style={{ backgroundColor: colorFor?.(item) ?? '#64748b' }} />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function Inspector({ selection }: { selection: Selection }) {
  if (!selection) {
    return <div className="emptyState">Select a node or edge.</div>;
  }
  const value = selection.value;
  const metadata = value.metadata ?? {};
  return (
    <div className="inspectorBody">
      <div className="eyebrow">{selection.kind}</div>
      <h2>{selection.kind === 'node' ? selection.value.label : selection.value.label}</h2>
      <dl>
        <dt>ID</dt>
        <dd>{value.id}</dd>
        <dt>Type</dt>
        <dd>{value.type}</dd>
        {'description' in value && value.description ? (
          <>
            <dt>Description</dt>
            <dd>{value.description}</dd>
          </>
        ) : null}
        {'source' in value ? (
          <>
            <dt>Source</dt>
            <dd>{value.source}</dd>
            <dt>Target</dt>
            <dd>{value.target}</dd>
          </>
        ) : null}
        {Object.keys(metadata).length > 0 ? (
          <>
            <dt>Metadata</dt>
            <dd><pre>{JSON.stringify(metadata, null, 2)}</pre></dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function App() {
  const [sessionId, setSessionId] = useState(() => new URLSearchParams(window.location.search).get('sessionId') ?? 'session_local');
  const [graph, setGraph] = useState<GraphSnapshot>(emptyGraph);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Selection>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [activeConnectors, setActiveConnectors] = useState<Set<string>>(new Set());
  const streamRef = useRef<EventSource | null>(null);

  const loadSnapshot = useCallback(async () => {
    setError('');
    const response = await fetch(apiUrl(`/context-graph?sessionId=${encodeURIComponent(sessionId)}`));
    if (!response.ok) throw new Error(`Graph request failed with ${response.status}`);
    const payload = await response.json() as GraphSnapshot;
    setGraph(payload);
    setStatus('live');
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    streamRef.current?.close();
    loadSnapshot().catch((reason: unknown) => {
      if (!cancelled) {
        setStatus('offline');
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    });

    const source = new EventSource(apiUrl(`/context-graph/stream?sessionId=${encodeURIComponent(sessionId)}`));
    streamRef.current = source;
    source.addEventListener('graph.snapshot', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as GraphSnapshot;
      setGraph(payload);
      setStatus('live');
      setError('');
    });
    source.addEventListener('graph.error', (event) => {
      setStatus('degraded');
      setError((event as MessageEvent<string>).data);
    });
    source.onerror = () => {
      setStatus('offline');
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [loadSnapshot, sessionId]);

  useEffect(() => {
    setActiveTypes(new Set(sortText(graph.nodes.map((node) => node.type))));
    setActiveConnectors(new Set(sortText(graph.nodes.map((node) => connectorOf(node)))));
  }, [graph.nodes]);

  const types = useMemo(() => sortText(graph.nodes.map((node) => node.type)), [graph.nodes]);
  const connectors = useMemo(() => sortText(graph.nodes.map((node) => connectorOf(node))), [graph.nodes]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const nodes = graph.nodes.filter((node) => {
      if (!activeTypes.has(node.type) || !activeConnectors.has(connectorOf(node))) return false;
      return needle ? searchTextForNode(node).includes(needle) : true;
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
      return needle ? searchTextForEdge(edge).includes(needle) || nodeIds.has(edge.source) || nodeIds.has(edge.target) : true;
    });
    return { nodes, edges };
  }, [activeConnectors, activeTypes, graph.edges, graph.nodes, query]);

  const latestEpisode = graph.episodes.at(-1);

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Open Bubble</div>
          <h1>Context Graph</h1>
        </div>
        <form className="sessionForm" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>Session</span>
            <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
          </label>
          <label>
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Node, fact, source" />
          </label>
          <button type="button" aria-label="Refresh graph" onClick={() => void loadSnapshot()}>Refresh</button>
        </form>
        <div className={`statusPill ${status}`}>{status}</div>
      </header>

      <section className="workspace">
        <aside className="leftPanel">
          <FilterList
            title="Connectors"
            items={connectors}
            active={activeConnectors}
            colorFor={(item) => connectorColor[item as Connector] ?? '#64748b'}
            onToggle={(item) => {
              const next = new Set(activeConnectors);
              if (next.has(item)) next.delete(item); else next.add(item);
              setActiveConnectors(next);
            }}
          />
          <FilterList
            title="Node Types"
            items={types}
            active={activeTypes}
            colorFor={(item) => typeColor[item] ?? '#64748b'}
            onToggle={(item) => {
              const next = new Set(activeTypes);
              if (next.has(item)) next.delete(item); else next.add(item);
              setActiveTypes(next);
            }}
          />
        </aside>

        <section className="graphPanel">
          <div className="graphHud">
            <span>{filtered.nodes.length} nodes</span>
            <span>{filtered.edges.length} facts</span>
            <span>{textValue(graph.stats.chunkCount)} chunks</span>
          </div>
          {error ? <div className="errorBanner">{error}</div> : null}
          <GraphCanvas nodes={filtered.nodes} edges={filtered.edges} selected={selected} onSelect={setSelected} />
        </section>

        <aside className="rightPanel">
          <Inspector selection={selected} />
          <section className="summaryBlock">
            <h2>Graph Health</h2>
            <dl>
              <dt>Session</dt>
              <dd>{graph.sessionId || sessionId}</dd>
              <dt>Nodes</dt>
              <dd>{graph.stats.nodeCount}</dd>
              <dt>Edges</dt>
              <dd>{graph.stats.edgeCount}</dd>
              <dt>Episodes</dt>
              <dd>{graph.stats.episodeCount}</dd>
              <dt>Latest</dt>
              <dd>{latestEpisode?.label ?? 'none'}</dd>
            </dl>
          </section>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
