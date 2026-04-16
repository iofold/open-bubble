import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { resolveFromRepoRoot } from './openapi.js';

const execFileAsync = promisify(execFile);

export type Connector = 'gmail' | 'drive' | 'calendar';

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  description: string;
  metadata: Record<string, unknown>;
  updatedAt: string | null;
  isEpisode: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  confidence: number | null;
  sourceEpisodeId: string | null;
  metadata: Record<string, unknown>;
  validAt: string | null;
  invalidAt: string | null;
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
    typeCounts: Record<string, number>;
    connectorCounts: Record<string, number>;
  };
}

export interface ContextGraphStoreOptions {
  dbPath?: string;
  duckdbCommand?: string;
}

type QueryRow = Record<string, unknown>;

type ContextRequest = {
  id?: string;
  requestId?: string;
  sessionId?: string;
  deviceId?: string;
  createdAt?: string;
  intent?: string;
  userExplicitlyRequestedCodeAssertion?: boolean | string;
  screenshot?: {
    capturedAt?: string;
    mimeType?: string;
    imageBase64?: string;
    screenMetadata?: Record<string, unknown>;
  };
  prompt?: {
    capturedAt?: string;
    transcript?: string;
    language?: string;
    audioMimeType?: string;
    audioBase64?: string;
  };
};

type McpFetch = {
  sessionId: string;
  connector: Connector;
  operation: string;
  query?: string;
  fetchedAt?: string;
  sourceRequestId?: string;
  results: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

const stopwords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'based', 'be', 'by', 'for',
  'from', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'should',
  'that', 'the', 'this', 'to', 'what', 'with'
]);

const fetchMarkers = new Set([
  'what', 'why', 'how', 'when', 'where', 'which', 'who', 'next',
  'answer', 'respond', 'response', 'summarize', 'summary', 'explain',
  'tell', 'show', 'find', 'fetch', 'query'
]);

const ingestOnlyMarkers = new Set([
  'remember', 'save', 'store', 'capture', 'record', 'note', 'log'
]);

const defaultDbPath = (): string =>
  process.env['OPEN_BUBBLE_CONTEXT_DB'] ??
  resolveFromRepoRoot('apps', 'codex-agent', 'data', 'context.duckdb');

const sqlString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  return `'${String(value).replace(/'/g, "''")}'`;
};

const sqlNumber = (value: unknown, fallback: number): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : String(fallback);
};

const jsonString = (value: unknown): string => JSON.stringify(value ?? {}, Object.keys(value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}).sort());

const stableId = (prefix: string, ...parts: unknown[]): string => {
  const raw = parts.filter((part) => part !== null && part !== undefined).join('|');
  return `${prefix}_${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
};

const nowIso = (): string => new Date().toISOString();

const tokenize = (text: string): string[] =>
  Array.from(text.toLowerCase().matchAll(/[a-z0-9][a-z0-9_/-]{1,}/g))
    .map((match) => match[0])
    .filter((token) => !stopwords.has(token));

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return { raw: value };
  }
};

const getString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const getObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const booleanTrue = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
};

const classifyIntent = (request: ContextRequest, transcript: string): string => {
  if (request.intent === 'code_assertion' && booleanTrue(request.userExplicitlyRequestedCodeAssertion)) {
    return 'code_assertion';
  }
  const words = new Set(tokenize(transcript));
  const hasIngestOnly = Array.from(words).some((word) => ingestOnlyMarkers.has(word));
  const hasFetch = Array.from(words).some((word) => fetchMarkers.has(word));
  if (hasIngestOnly && !hasFetch && !transcript.includes('?')) {
    return 'ingest_only';
  }
  if (hasFetch || transcript.includes('?') || request.intent === 'context_question') {
    return 'fetch_response';
  }
  return transcript ? 'fetch_response' : 'ingest_only';
};

const screenSummary = (request: ContextRequest): string => {
  const metadata = getObject(request.screenshot?.screenMetadata);
  const observations: string[] = [];
  if (metadata['appPackage']) {
    observations.push(`App package: ${String(metadata['appPackage'])}`);
  }
  if (metadata['visibleText']) {
    observations.push(`Visible text: ${String(metadata['visibleText'])}`);
  }
  return observations.length > 0
    ? observations.join('; ')
    : 'Screenshot supplied without analyzable metadata';
};

const upsertEntitySql = (
  id: string,
  sessionId: string,
  type: string,
  name: string,
  description: string,
  metadata: Record<string, unknown>,
  timestamp: string
): string => `
INSERT INTO graph_entities (id, session_id, type, name, description, metadata, updated_at)
VALUES (${sqlString(id)}, ${sqlString(sessionId)}, ${sqlString(type)}, ${sqlString(name)}, ${sqlString(description)}, ${sqlString(JSON.stringify(metadata))}, CAST(${sqlString(timestamp)} AS TIMESTAMP))
ON CONFLICT(id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;`;

const upsertEpisodeSql = (
  id: string,
  sessionId: string,
  type: string,
  source: string,
  content: string,
  metadata: Record<string, unknown>,
  createdAt: string,
  ingestedAt: string
): string => `
INSERT INTO graph_episodes (id, session_id, type, source, content, metadata, created_at, ingested_at)
VALUES (${sqlString(id)}, ${sqlString(sessionId)}, ${sqlString(type)}, ${sqlString(source)}, ${sqlString(content)}, ${sqlString(JSON.stringify(metadata))}, CAST(${sqlString(createdAt)} AS TIMESTAMP), CAST(${sqlString(ingestedAt)} AS TIMESTAMP))
ON CONFLICT(id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  type = EXCLUDED.type,
  source = EXCLUDED.source,
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata,
  created_at = EXCLUDED.created_at,
  ingested_at = EXCLUDED.ingested_at;`;

const upsertRelationSql = (
  id: string,
  sourceId: string,
  targetId: string,
  type: string,
  fact: string,
  metadata: Record<string, unknown>,
  timestamp: string,
  confidence = 0.8,
  sourceEpisodeId?: string
): string => `
INSERT INTO graph_relations (id, source_id, target_id, type, fact, weight, confidence, valid_at, invalid_at, source_episode_id, metadata, updated_at)
VALUES (${sqlString(id)}, ${sqlString(sourceId)}, ${sqlString(targetId)}, ${sqlString(type)}, ${sqlString(fact)}, 1.0, ${sqlNumber(confidence, 0.8)}, CAST(${sqlString(timestamp)} AS TIMESTAMP), NULL, ${sqlString(sourceEpisodeId)}, ${sqlString(JSON.stringify(metadata))}, CAST(${sqlString(timestamp)} AS TIMESTAMP))
ON CONFLICT(id) DO UPDATE SET
  source_id = EXCLUDED.source_id,
  target_id = EXCLUDED.target_id,
  type = EXCLUDED.type,
  fact = EXCLUDED.fact,
  weight = EXCLUDED.weight,
  confidence = EXCLUDED.confidence,
  valid_at = EXCLUDED.valid_at,
  invalid_at = EXCLUDED.invalid_at,
  source_episode_id = EXCLUDED.source_episode_id,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;`;

const upsertChunkSql = (
  id: string,
  sessionId: string,
  source: string,
  text: string,
  metadata: Record<string, unknown>,
  timestamp: string
): string => `
INSERT INTO context_chunks (id, session_id, source, text, metadata, updated_at)
VALUES (${sqlString(id)}, ${sqlString(sessionId)}, ${sqlString(source)}, ${sqlString(text)}, ${sqlString(JSON.stringify(metadata))}, CAST(${sqlString(timestamp)} AS TIMESTAMP))
ON CONFLICT(id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  source = EXCLUDED.source,
  text = EXCLUDED.text,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;`;

const initSchemaSql = (): string => `
CREATE TABLE IF NOT EXISTS session_context (
  session_id VARCHAR,
  key VARCHAR,
  value VARCHAR,
  updated_at TIMESTAMP,
  PRIMARY KEY (session_id, key)
);
CREATE TABLE IF NOT EXISTS graph_episodes (
  id VARCHAR PRIMARY KEY,
  session_id VARCHAR,
  type VARCHAR,
  source VARCHAR,
  content VARCHAR,
  metadata VARCHAR,
  created_at TIMESTAMP,
  ingested_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS graph_entities (
  id VARCHAR PRIMARY KEY,
  session_id VARCHAR,
  type VARCHAR,
  name VARCHAR,
  description VARCHAR,
  metadata VARCHAR,
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS graph_relations (
  id VARCHAR PRIMARY KEY,
  source_id VARCHAR,
  target_id VARCHAR,
  type VARCHAR,
  fact VARCHAR,
  weight DOUBLE,
  confidence DOUBLE,
  valid_at TIMESTAMP,
  invalid_at TIMESTAMP,
  source_episode_id VARCHAR,
  metadata VARCHAR,
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS context_chunks (
  id VARCHAR PRIMARY KEY,
  session_id VARCHAR,
  source VARCHAR,
  text VARCHAR,
  metadata VARCHAR,
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS context_requests (
  id VARCHAR PRIMARY KEY,
  session_id VARCHAR,
  device_id VARCHAR,
  intent VARCHAR,
  classified_intent VARCHAR,
  transcript VARCHAR,
  screenshot_summary VARCHAR,
  raw_json VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);`;

class SerializedQueue {
  private current: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.current.then(task, task);
    this.current = next.catch(() => undefined);
    return next;
  }
}

export class ContextGraphStore {
  private readonly dbPath: string;
  private readonly duckdbCommand: string;
  private readonly queue = new SerializedQueue();

  constructor(options: ContextGraphStoreOptions = {}) {
    this.dbPath = options.dbPath ?? defaultDbPath();
    this.duckdbCommand = options.duckdbCommand ?? 'duckdb';
  }

  async init(): Promise<void> {
    await this.runSql(initSchemaSql());
  }

  async queryJson(sql: string): Promise<QueryRow[]> {
    await this.init();
    return this.queue.run(async () => {
      const { stdout } = await execFileAsync(this.duckdbCommand, ['-json', this.dbPath, sql], {
        maxBuffer: 10 * 1024 * 1024
      });
      const trimmed = stdout.trim();
      return trimmed ? JSON.parse(trimmed) as QueryRow[] : [];
    });
  }

  async runSql(sql: string): Promise<void> {
    await this.queue.run(async () => {
      await execFileAsync(this.duckdbCommand, [this.dbPath, sql], {
        maxBuffer: 10 * 1024 * 1024
      });
    });
  }

  async seed(fixture: Record<string, unknown>, reset = false): Promise<Record<string, unknown>> {
    const sessionId = getString(fixture['sessionId'], 'session_local');
    const timestamp = nowIso();
    const sessionContext = getObject(fixture['sessionContext']);
    const episodes = Array.isArray(fixture['episodes']) ? fixture['episodes'] as Record<string, unknown>[] : [];
    const entities = Array.isArray(fixture['entities']) ? fixture['entities'] as Record<string, unknown>[] : [];
    const relations = Array.isArray(fixture['relations']) ? fixture['relations'] as Record<string, unknown>[] : [];
    const chunks = Array.isArray(fixture['chunks']) ? fixture['chunks'] as Record<string, unknown>[] : [];
    const statements: string[] = [initSchemaSql()];
    if (reset) {
      statements.push('DELETE FROM graph_relations; DELETE FROM graph_entities; DELETE FROM graph_episodes; DELETE FROM context_chunks; DELETE FROM context_requests; DELETE FROM session_context;');
    }
    for (const [key, value] of Object.entries(sessionContext)) {
      statements.push(`
INSERT INTO session_context (session_id, key, value, updated_at)
VALUES (${sqlString(sessionId)}, ${sqlString(key)}, ${sqlString(jsonString(value))}, CAST(${sqlString(timestamp)} AS TIMESTAMP))
ON CONFLICT(session_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;`);
    }
    for (const episode of episodes) {
      statements.push(upsertEpisodeSql(
        getString(episode['id']),
        sessionId,
        getString(episode['type'], 'seed_context'),
        getString(episode['source'], 'server-seed'),
        getString(episode['content']),
        getObject(episode['metadata']),
        getString(episode['createdAt'], timestamp),
        timestamp
      ));
    }
    for (const entity of entities) {
      statements.push(upsertEntitySql(
        getString(entity['id']),
        sessionId,
        getString(entity['type']),
        getString(entity['name']),
        getString(entity['description']),
        getObject(entity['metadata']),
        timestamp
      ));
    }
    for (const relation of relations) {
      statements.push(upsertRelationSql(
        getString(relation['id']),
        getString(relation['sourceId']),
        getString(relation['targetId']),
        getString(relation['type']),
        getString(relation['fact'], getString(relation['type'])),
        getObject(relation['metadata']),
        timestamp,
        Number(relation['confidence'] ?? 0.8),
        getString(relation['sourceEpisodeId']) || undefined
      ));
    }
    for (const chunk of chunks) {
      statements.push(upsertChunkSql(
        getString(chunk['id']),
        sessionId,
        getString(chunk['source']),
        getString(chunk['text']),
        getObject(chunk['metadata']),
        timestamp
      ));
    }
    await this.runSql(statements.join('\n'));
    return {
      database: this.dbPath,
      sessionId,
      episodes: episodes.length,
      entities: entities.length,
      relations: relations.length,
      chunks: chunks.length,
      sessionContextKeys: Object.keys(sessionContext).length
    };
  }

  async ingestMcp(fetch: McpFetch): Promise<Record<string, unknown>> {
    const timestamp = nowIso();
    const connector = fetch.connector;
    const episodeId = stableId('episode', connector, fetch.operation, fetch.sessionId, fetch.query, fetch.fetchedAt);
    const statements: string[] = [
      initSchemaSql(),
      upsertEpisodeSql(
        episodeId,
        fetch.sessionId,
        `mcp_${connector}_${fetch.operation}`,
        `mcp:${connector}:${fetch.operation}`,
        fetch.results.map((item) => [item['subject'], item['name'], item['title'], item['snippet'], item['description']].filter(Boolean).join('\n')).join('\n'),
        {
          connector,
          operation: fetch.operation,
          query: fetch.query,
          sourceRequestId: fetch.sourceRequestId,
          redaction: 'snippet_only',
          userVisible: true,
          ...(fetch.metadata ?? {})
        },
        fetch.fetchedAt ?? timestamp,
        timestamp
      )
    ];
    const counts = { episodes: 1, entities: 0, relations: 0, chunks: 0 };
    const addEntity = (id: string, type: string, name: string, description: string, metadata: Record<string, unknown>): void => {
      statements.push(upsertEntitySql(id, fetch.sessionId, type, name, description, metadata, timestamp));
      counts.entities += 1;
      addRelation(episodeId, id, 'episode_mentions', 'MCP episode mentions entity', { sourceRequestId: fetch.sourceRequestId });
      addRelation(episodeId, id, 'derived_from_mcp', 'Entity was derived from MCP connector data', { sourceRequestId: fetch.sourceRequestId });
    };
    const addRelation = (sourceId: string, targetId: string, type: string, fact: string, metadata: Record<string, unknown> = {}): void => {
      statements.push(upsertRelationSql(stableId('rel', sourceId, targetId, type, episodeId), sourceId, targetId, type, fact, metadata, timestamp, 0.85, episodeId));
      counts.relations += 1;
    };
    const addChunk = (source: string, text: string, metadata: Record<string, unknown>): void => {
      if (!text.trim()) return;
      statements.push(upsertChunkSql(stableId('chunk', fetch.sessionId, source, text.slice(0, 80)), fetch.sessionId, source, text, {
        mcpTool: 'search',
        redaction: 'snippet_only',
        userVisible: true,
        ...metadata
      }, timestamp));
      counts.chunks += 1;
    };
    const addPerson = (person: Record<string, unknown>): string => {
      const email = getString(person['email']).toLowerCase();
      const name = getString(person['name'], email || 'Unknown person');
      const id = stableId('person', email || name);
      addEntity(id, 'person', name, email, { email: person['email'], name: person['name'] });
      return id;
    };

    for (const item of fetch.results) {
      if (connector === 'gmail') {
        const messageId = `gmail_message:${getString(item['id'])}`;
        const threadId = `gmail_thread:${getString(item['threadId'], getString(item['id']))}`;
        const subject = getString(item['subject'], 'Gmail message');
        const snippet = getString(item['snippet']);
        addEntity(threadId, 'gmail_thread', subject, subject, { connector, threadId: item['threadId'] });
        addEntity(messageId, 'gmail_message', subject, snippet, { connector, messageId: item['id'], date: item['date'] });
        addRelation(messageId, threadId, 'part_of_thread', 'Gmail message belongs to thread');
        const sender = getObject(item['from']);
        if (Object.keys(sender).length > 0) addRelation(messageId, addPerson(sender), 'sent_by', 'Gmail message was sent by person');
        const recipients = Array.isArray(item['to']) ? item['to'] as Record<string, unknown>[] : [];
        for (const recipient of recipients) addRelation(messageId, addPerson(recipient), 'sent_to', 'Gmail message was sent to person');
        const attachments = Array.isArray(item['attachments']) ? item['attachments'] as Record<string, unknown>[] : [];
        for (const attachment of attachments) {
          const attachmentId = `attachment:${getString(attachment['id'], stableId('att', attachment['name']))}`;
          addEntity(attachmentId, 'attachment', getString(attachment['name'], 'Attachment'), getString(attachment['mimeType']), { connector, ...attachment });
          addRelation(messageId, attachmentId, 'has_attachment', 'Gmail message has attachment');
        }
        addChunk(`mcp:gmail:${item['id']}`, `${subject}\n${snippet}`, { connector, messageId: item['id'], sourceEpisodeId: episodeId });
      }
      if (connector === 'drive') {
        const fileId = `drive_file:${getString(item['id'])}`;
        const name = getString(item['name'], 'Drive file');
        const snippet = getString(item['snippet']);
        addEntity(fileId, 'drive_file', name, snippet, { connector, fileId: item['id'], mimeType: item['mimeType'], webUrl: item['webUrl'] });
        const owner = getObject(item['owner']);
        if (Object.keys(owner).length > 0) addRelation(fileId, addPerson(owner), 'owned_by', 'Drive file is owned by person');
        const sharedWith = Array.isArray(item['sharedWith']) ? item['sharedWith'] as Record<string, unknown>[] : [];
        for (const shared of sharedWith) addRelation(fileId, addPerson(shared), 'shared_with', 'Drive file is shared with person');
        const folder = getObject(item['folder']);
        if (Object.keys(folder).length > 0) {
          const folderId = `drive_folder:${getString(folder['id'], stableId('folder', folder['name']))}`;
          addEntity(folderId, 'drive_folder', getString(folder['name'], 'Drive folder'), getString(folder['name']), { connector, ...folder });
          addRelation(fileId, folderId, 'contained_in', 'Drive file is contained in folder');
        }
        const sections = Array.isArray(item['sections']) ? item['sections'] as Record<string, unknown>[] : [];
        for (const section of sections) {
          const sectionId = `document_section:${getString(section['id'], stableId('section', fileId, section['title']))}`;
          addEntity(sectionId, 'document_section', getString(section['title'], 'Document section'), getString(section['text']), { connector, ...section });
          addRelation(sectionId, fileId, 'contained_in', 'Document section belongs to Drive file');
          addChunk(`mcp:drive:${sectionId}`, `${getString(section['title'])}\n${getString(section['text'])}`, { connector, fileId: item['id'], sourceEpisodeId: episodeId });
        }
        addChunk(`mcp:drive:${item['id']}`, `${name}\n${snippet}`, { connector, fileId: item['id'], sourceEpisodeId: episodeId });
      }
      if (connector === 'calendar') {
        const eventId = `calendar_event:${getString(item['id'])}`;
        const title = getString(item['title'], 'Calendar event');
        const description = getString(item['description']);
        addEntity(eventId, 'calendar_event', title, description, { connector, eventId: item['id'], start: item['start'], end: item['end'], location: item['location'] });
        const timeId = stableId('time', item['start'], item['end']);
        addEntity(timeId, 'time_anchor', getString(item['start'], 'Event time'), getString(item['end']), { start: item['start'], end: item['end'] });
        addRelation(eventId, timeId, 'scheduled_at', 'Calendar event is scheduled at time');
        if (item['location']) {
          const locationId = stableId('location', item['location']);
          addEntity(locationId, 'location', getString(item['location']), 'Calendar event location', { connector, location: item['location'] });
          addRelation(eventId, locationId, 'mentions', 'Calendar event mentions location');
        }
        const attendees = Array.isArray(item['attendees']) ? item['attendees'] as Record<string, unknown>[] : [];
        for (const attendee of attendees) {
          const attendeeId = addPerson(attendee);
          addRelation(eventId, attendeeId, 'attended_by', 'Calendar event includes attendee');
          addRelation(eventId, attendeeId, 'scheduled_with', 'Calendar event is scheduled with person');
        }
        addChunk(`mcp:calendar:${item['id']}`, `${title}\n${description}\n${getString(item['start'])} - ${getString(item['end'])}`, { connector, eventId: item['id'], sourceEpisodeId: episodeId });
      }
    }
    await this.runSql(statements.join('\n'));
    return {
      database: this.dbPath,
      sessionId: fetch.sessionId,
      connector,
      operation: fetch.operation,
      episodeId,
      ingested: counts
    };
  }

  async ingestContextRequest(payload: ContextRequest): Promise<Record<string, unknown>> {
    const sessionId = payload.sessionId ?? 'session_local';
    const requestId = payload.id ?? payload.requestId ?? stableId('ctx_req', sessionId, payload.createdAt, payload.deviceId);
    const transcript = payload.prompt?.transcript?.trim() ?? '';
    const intent = classifyIntent(payload, transcript);
    const timestamp = nowIso();
    const summary = screenSummary(payload);
    const episodeId = `episode:${requestId}`;
    const requestNodeId = `request:${requestId}`;
    const sessionNodeId = `session:${sessionId}`;
    const deviceNodeId = stableId('device', payload.deviceId ?? 'device_unknown');
    const intentNodeId = stableId('intent', intent);
    const screenshotNodeId = `screenshot:${requestId}`;
    const voiceNodeId = `voice:${requestId}`;
    const statements = [
      initSchemaSql(),
      upsertEpisodeSql(episodeId, sessionId, 'frontend_context_request', 'open_bubble_frontend', [transcript, summary].filter(Boolean).join('\n'), {
        requestId,
        deviceId: payload.deviceId,
        clientIntent: payload.intent,
        classifiedIntent: intent
      }, payload.createdAt ?? timestamp, timestamp),
      `INSERT INTO context_requests (id, session_id, device_id, intent, classified_intent, transcript, screenshot_summary, raw_json, created_at, updated_at)
       VALUES (${sqlString(requestId)}, ${sqlString(sessionId)}, ${sqlString(payload.deviceId)}, ${sqlString(payload.intent)}, ${sqlString(intent)}, ${sqlString(transcript)}, ${sqlString(summary)}, ${sqlString(JSON.stringify(payload))}, CAST(${sqlString(payload.createdAt ?? timestamp)} AS TIMESTAMP), CAST(${sqlString(timestamp)} AS TIMESTAMP))
       ON CONFLICT(id) DO UPDATE SET session_id = EXCLUDED.session_id, device_id = EXCLUDED.device_id, intent = EXCLUDED.intent, classified_intent = EXCLUDED.classified_intent, transcript = EXCLUDED.transcript, screenshot_summary = EXCLUDED.screenshot_summary, raw_json = EXCLUDED.raw_json, updated_at = EXCLUDED.updated_at;`,
      upsertEntitySql(sessionNodeId, sessionId, 'agent_session', sessionId, `Open Bubble agent session ${sessionId}`, { sessionId }, timestamp),
      upsertEntitySql(deviceNodeId, sessionId, 'frontend_device', payload.deviceId ?? 'device_unknown', `Frontend device ${payload.deviceId ?? 'device_unknown'}`, { deviceId: payload.deviceId }, timestamp),
      upsertEntitySql(intentNodeId, sessionId, 'user_intent', intent, `Classified user intent: ${intent}`, { classifiedIntent: intent, clientIntent: payload.intent }, timestamp),
      upsertEntitySql(requestNodeId, sessionId, 'context_request', `Context request ${requestId}`, transcript || summary, { requestId, classifiedIntent: intent }, timestamp),
      upsertEntitySql(screenshotNodeId, sessionId, 'screenshot_observation', `Screenshot for ${requestId}`, summary, { ...getObject(payload.screenshot?.screenMetadata), analysisMode: 'metadata_only' }, timestamp),
      upsertEntitySql(voiceNodeId, sessionId, 'voice_note', `Voice note for ${requestId}`, transcript || 'Voice prompt supplied without transcript', { transcript, analysisMode: transcript ? 'transcript_keywords' : 'metadata_only' }, timestamp),
      upsertChunkSql(stableId('chunk', requestId, 'voice'), sessionId, `voice:${requestId}`, transcript, { transcript }, timestamp),
      upsertChunkSql(stableId('chunk', requestId, 'screenshot'), sessionId, `screenshot:${requestId}`, summary, { summary }, timestamp)
    ];
    for (const [targetId, relType, fact] of [
      [requestNodeId, 'episode_mentions', 'Episode contains context request'],
      [screenshotNodeId, 'episode_mentions', 'Episode contains screenshot observation'],
      [voiceNodeId, 'episode_mentions', 'Episode contains voice note'],
      [sessionNodeId, 'episode_mentions', 'Episode occurred in session'],
      [deviceNodeId, 'episode_mentions', 'Episode mentions frontend device'],
      [intentNodeId, 'episode_mentions', 'Episode expresses user intent'],
      [sessionNodeId, 'in_session', 'Context request belongs to session'],
      [deviceNodeId, 'from_device', 'Context request came from frontend device'],
      [intentNodeId, 'expresses_intent', 'Context request expresses classified intent'],
      [screenshotNodeId, 'has_screenshot', 'Context request includes screenshot'],
      [voiceNodeId, 'has_voice_note', 'Context request includes voice note']
    ] as Array<[string, string, string]>) {
      const sourceId = relType === 'episode_mentions' ? episodeId : requestNodeId;
      statements.push(upsertRelationSql(stableId('rel', sourceId, targetId, relType), sourceId, targetId, relType, fact, { requestId }, timestamp, 0.8, episodeId));
    }
    await this.runSql(statements.join('\n'));
    const chunks = await this.relevantChunks(sessionId, transcript, requestId);
    const answer = intent === 'ingest_only'
      ? null
      : this.buildAnswer(requestId, sessionId, intent, transcript, summary, chunks);
    return {
      requestId,
      sessionId,
      classifiedIntent: intent,
      ingested: { entities: 6, relations: 11, chunks: 2, requests: 1 },
      answerProduced: answer !== null,
      answer,
      database: this.dbPath
    };
  }

  async relevantChunks(sessionId: string, transcript: string, currentRequestId: string): Promise<QueryRow[]> {
    const terms = tokenize(transcript).slice(0, 8);
    if (terms.length === 0) {
      return this.queryJson(`
        SELECT id, source, text, metadata, updated_at
        FROM context_chunks
        WHERE session_id = ${sqlString(sessionId)}
          AND source NOT LIKE '%' || ${sqlString(currentRequestId)} || '%'
        ORDER BY updated_at DESC
        LIMIT 8;
      `);
    }
    const clauses = terms.map((term) => `lower(text) LIKE ${sqlString(`%${term}%`)}`).join(' OR ');
    return this.queryJson(`
      SELECT id, source, text, metadata, updated_at
      FROM context_chunks
      WHERE session_id = ${sqlString(sessionId)}
        AND source NOT LIKE '%' || ${sqlString(currentRequestId)} || '%'
        AND (${clauses})
      ORDER BY updated_at DESC
      LIMIT 8;
    `);
  }

  buildAnswer(requestId: string, sessionId: string, intent: string, transcript: string, screenshotSummary: string, chunks: QueryRow[]): Record<string, unknown> {
    const connectors = Array.from(new Set(chunks.map((chunk) => parseJsonObject(chunk['metadata'])['connector']).filter(Boolean).map(String))).sort();
    const localContextUsed = [
      'request',
      'duckdb:context_requests',
      'duckdb:context_chunks',
      ...connectors.map((connector) => `mcp:${connector}`),
      'screenshot:metadata',
      'voice:transcript'
    ];
    const firstText = getString(chunks[0]?.['text']);
    const clean = firstText.length > 180 ? `${firstText.slice(0, 177).trimEnd()}...` : firstText;
    const summary = clean
      ? `The context graph points to this answer: ${clean.replace(/\s+/g, ' ')}`
      : `I ingested the request. The current screenshot context says: ${screenshotSummary}`;
    const answer: Record<string, unknown> = {
      summary,
      details: `Request ${requestId} was ingested for session ${sessionId}. Matched graph chunks: ${chunks.map((chunk) => chunk['source']).join(', ') || 'none'}.`,
      confidence: chunks.length > 0 ? 'medium' : 'low',
      retrievalMode: intent === 'code_assertion' ? 'mixed' : 'direct_duckdb',
      localContextUsed
    };
    if (intent === 'code_assertion') {
      answer['codeAssertionResult'] = {
        verdict: 'inconclusive',
        reasoning: 'Fast graph-backed pass does not inspect code deeply enough for a firm assertion.',
        evidence: chunks.slice(0, 5).map((chunk) => chunk['source'])
      };
    }
    return answer;
  }

  async exportGraph(sessionId: string, connector?: Connector): Promise<GraphSnapshot> {
    await this.init();
    const entityRows = await this.queryJson(`
      SELECT id, type, name, description, metadata, updated_at
      FROM graph_entities
      WHERE session_id = ${sqlString(sessionId)}
      ORDER BY type, name;
    `);
    const episodeRows = await this.queryJson(`
      SELECT id, type, source, content, metadata, created_at, ingested_at
      FROM graph_episodes
      WHERE session_id = ${sqlString(sessionId)}
      ORDER BY ingested_at, id;
    `);
    const relationRows = await this.queryJson(`
      SELECT id, source_id, target_id, type, fact, confidence, source_episode_id, metadata, valid_at, invalid_at
      FROM graph_relations
      ORDER BY updated_at, id;
    `);
    const chunkRows = await this.queryJson(`SELECT COUNT(*) AS count FROM context_chunks WHERE session_id = ${sqlString(sessionId)};`);
    const nodes: GraphNode[] = [];
    for (const row of entityRows) {
      const metadata = parseJsonObject(row['metadata']);
      if (connector && metadata['connector'] !== connector) continue;
      nodes.push({
        id: getString(row['id']),
        type: getString(row['type']),
        label: getString(row['name']),
        description: getString(row['description']),
        metadata,
        updatedAt: row['updated_at'] ? String(row['updated_at']) : null,
        isEpisode: false
      });
    }
    for (const row of episodeRows) {
      const metadata = parseJsonObject(row['metadata']);
      if (connector && metadata['connector'] !== connector) continue;
      nodes.push({
        id: getString(row['id']),
        type: getString(row['type']),
        label: getString(row['type']).replace(/_/g, ' '),
        description: getString(row['content']),
        metadata,
        updatedAt: row['ingested_at'] ? String(row['ingested_at']) : null,
        isEpisode: true
      });
    }
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: GraphEdge[] = relationRows
      .filter((row) => nodeIds.has(getString(row['source_id'])) && nodeIds.has(getString(row['target_id'])))
      .map((row) => ({
        id: getString(row['id']),
        source: getString(row['source_id']),
        target: getString(row['target_id']),
        type: getString(row['type']),
        label: getString(row['fact'], getString(row['type'])),
        confidence: typeof row['confidence'] === 'number' ? row['confidence'] : null,
        sourceEpisodeId: row['source_episode_id'] ? String(row['source_episode_id']) : null,
        metadata: parseJsonObject(row['metadata']),
        validAt: row['valid_at'] ? String(row['valid_at']) : null,
        invalidAt: row['invalid_at'] ? String(row['invalid_at']) : null
      }));
    const typeCounts: Record<string, number> = {};
    const connectorCounts: Record<string, number> = {};
    for (const node of nodes) {
      typeCounts[node.type] = (typeCounts[node.type] ?? 0) + 1;
      const nodeConnector = getString(node.metadata['connector'], 'local');
      connectorCounts[nodeConnector] = (connectorCounts[nodeConnector] ?? 0) + 1;
    }
    const episodes = nodes.filter((node) => node.isEpisode);
    return {
      sessionId,
      nodes,
      edges,
      episodes,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        episodeCount: episodes.length,
        chunkCount: Number(chunkRows[0]?.['count'] ?? 0),
        typeCounts,
        connectorCounts
      }
    };
  }
}
