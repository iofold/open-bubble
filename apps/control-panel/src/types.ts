export type Connector = 'local' | 'gmail' | 'drive' | 'calendar';

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
  updatedAt?: string | null;
  isEpisode?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  confidence?: number | null;
  sourceEpisodeId?: string | null;
  metadata?: Record<string, unknown>;
  validAt?: string | null;
  invalidAt?: string | null;
}

export interface GraphSnapshot {
  sessionId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  episodes: GraphNode[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    episodeCount: number;
    chunkCount: number;
    typeCounts?: Record<string, number>;
    connectorCounts?: Record<string, number>;
  };
}

export type Selection =
  | { kind: 'node'; value: GraphNode }
  | { kind: 'edge'; value: GraphEdge }
  | null;
