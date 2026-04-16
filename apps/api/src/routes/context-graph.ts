import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ContextGraphStore, type Connector } from '../lib/context-graph-store.js';
import { resolveFromRepoRoot } from '../lib/openapi.js';

export interface ContextGraphRouteOptions {
  store?: ContextGraphStore;
}

const controlPanelRoot = (): string =>
  resolveFromRepoRoot('apps', 'codex-agent', 'control-panel');

const contentTypeFor = (filePath: string): string => {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
};

const getQueryValue = (
  request: FastifyRequest,
  key: string,
  fallback?: string
): string | undefined => {
  const query = request.query as Record<string, unknown>;
  const value = query[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

const getConnector = (request: FastifyRequest): Connector | undefined => {
  const raw = getQueryValue(request, 'connector');
  if (raw === 'gmail' || raw === 'drive' || raw === 'calendar') {
    return raw;
  }
  return undefined;
};

const graphSnapshotHash = (payload: unknown): string =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const sendControlPanelFile = async (
  reply: FastifyReply,
  relativePath: string
): Promise<FastifyReply> => {
  const root = controlPanelRoot();
  const resolved = path.resolve(root, relativePath);

  if (!resolved.startsWith(root)) {
    return reply.code(404).send({ error: 'not_found', message: 'File not found.' });
  }

  try {
    const data = await readFile(resolved);
    return reply
      .header('content-type', contentTypeFor(resolved))
      .send(data);
  } catch {
    return reply.code(404).send({ error: 'not_found', message: 'File not found.' });
  }
};

export const contextGraphRoute = ({
  store = new ContextGraphStore()
}: ContextGraphRouteOptions = {}): FastifyPluginAsync => {
  const route: FastifyPluginAsync = async (app) => {
    app.get('/context-graph', async (request) => {
      const sessionId = getQueryValue(request, 'sessionId', 'sess_test_001') ?? 'sess_test_001';
      return store.exportGraph(sessionId, getConnector(request));
    });

    app.get('/context-graph/stream', async (request, reply) => {
      const sessionId = getQueryValue(request, 'sessionId', 'sess_test_001') ?? 'sess_test_001';
      const connector = getConnector(request);
      const rawInterval = Number(getQueryValue(request, 'interval', '1000'));
      const intervalMs = Number.isFinite(rawInterval) && rawInterval >= 250 ? rawInterval : 1000;

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'access-control-allow-origin': '*'
      });

      let lastHash = '';
      let closed = false;
      request.raw.on('close', () => {
        closed = true;
      });

      const sendSnapshot = async (): Promise<void> => {
        if (closed) return;
        const snapshot = await store.exportGraph(sessionId, connector);
        const nextHash = graphSnapshotHash(snapshot);
        if (nextHash !== lastHash) {
          lastHash = nextHash;
          reply.raw.write(`event: graph.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
        }
      };

      await sendSnapshot();
      const timer = setInterval(() => {
        void sendSnapshot().catch((error) => {
          reply.raw.write(`event: graph.error\ndata: ${JSON.stringify({ message: String(error) })}\n\n`);
        });
      }, intervalMs);
      request.raw.on('close', () => {
        clearInterval(timer);
      });

      return reply;
    });

    const seedHandler = async (request: FastifyRequest) => {
      const body = request.body as Record<string, unknown>;
      const fixture = typeof body['fixture'] === 'object' && body['fixture'] !== null
        ? body['fixture'] as Record<string, unknown>
        : body;
      return store.seed(fixture, body['reset'] === true);
    };

    const ingestMcpHandler = async (request: FastifyRequest) => {
      return store.ingestMcp(request.body as never);
    };

    const ingestContextRequestHandler = async (request: FastifyRequest) => {
      const body = request.body as Record<string, unknown>;
      const payload = typeof body['request'] === 'object' && body['request'] !== null
        ? body['request'] as never
        : body as never;
      return store.ingestContextRequest(payload);
    };

    app.post('/context-graph/seed', seedHandler);
    app.post('/seed', seedHandler);
    app.post('/context-graph/ingest/mcp-results', ingestMcpHandler);
    app.post('/ingest/mcp-results', ingestMcpHandler);
    app.post('/context-graph/ingest/context-request', ingestContextRequestHandler);
    app.post('/ingest/context-request', ingestContextRequestHandler);

    app.get('/control-panel', async (_request, reply) =>
      sendControlPanelFile(reply, 'index.html'));

    app.get('/control-panel/:asset', async (request, reply) => {
      const params = request.params as { asset: string };
      return sendControlPanelFile(reply, params.asset);
    });
  };

  return route;
};
