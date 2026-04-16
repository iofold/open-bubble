import { createHash, randomUUID } from 'node:crypto';

export type Connector = 'gmail' | 'drive' | 'calendar';
export type ConnectorDispatchAction = 'fetch' | 'draft_email' | 'create_calendar_event';

export interface ConnectorDispatchRequest {
  sessionId?: string;
  connector?: Connector;
  action?: ConnectorDispatchAction;
  query?: string;
  sourceRequestId?: string;
  parameters?: Record<string, unknown>;
}

export interface McpFetchResult {
  sessionId: string;
  connector: Connector;
  operation: string;
  query?: string;
  fetchedAt: string;
  sourceRequestId?: string;
  results: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
}

export interface McpToolClient {
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    context?: { sessionId: string }
  ): Promise<unknown>;
}

export interface ConnectorDispatchResult {
  kind: 'context_ingested' | 'action_executed';
  sessionId: string;
  connector: Connector;
  action: ConnectorDispatchAction;
  tool: string;
  mcpResult: unknown;
  normalizedFetch?: McpFetchResult;
}

export class ConnectorInputError extends Error {
  readonly statusCode = 400;
}

export class ConnectorConfigurationError extends Error {
  readonly statusCode = 503;
}

const allowedTools = {
  gmailFetch: 'GMAIL_FETCH_EMAILS',
  driveFetch: 'GOOGLEDRIVE_FIND_FILE',
  calendarFetch: 'GOOGLECALENDAR_EVENTS_LIST',
  draftEmail: 'GMAIL_CREATE_EMAIL_DRAFT',
  createCalendarEvent: 'GOOGLECALENDAR_CREATE_EVENT'
} as const;

const allowedToolkits = ['gmail', 'googledrive', 'googlecalendar'] as const;

const composioToolkitTools = {
  gmail: [allowedTools.gmailFetch, allowedTools.draftEmail],
  googledrive: [allowedTools.driveFetch],
  googlecalendar: [allowedTools.calendarFetch, allowedTools.createCalendarEvent]
} as const;

const isConnector = (value: unknown): value is Connector =>
  value === 'gmail' || value === 'drive' || value === 'calendar';

const isAction = (value: unknown): value is ConnectorDispatchAction =>
  value === 'fetch' || value === 'draft_email' || value === 'create_calendar_event';

const connectorForAction = (action: ConnectorDispatchAction): Connector | undefined => {
  if (action === 'draft_email') return 'gmail';
  if (action === 'create_calendar_event') return 'calendar';
  return undefined;
};

const toolFor = (connector: Connector, action: ConnectorDispatchAction): string => {
  if (action === 'draft_email') return allowedTools.draftEmail;
  if (action === 'create_calendar_event') return allowedTools.createCalendarEvent;
  if (connector === 'gmail') return allowedTools.gmailFetch;
  if (connector === 'drive') return allowedTools.driveFetch;
  return allowedTools.calendarFetch;
};

const connectorSignals: Record<Connector, string[]> = {
  gmail: ['email', 'gmail', 'inbox', 'thread', 'message', 'sender', 'reply', 'draft'],
  drive: ['drive', 'doc', 'document', 'file', 'sheet', 'deck', 'notes'],
  calendar: ['calendar', 'meeting', 'event', 'schedule', 'availability', 'tomorrow', 'today']
};

const inferConnector = (value: string): Connector | undefined => {
  const lower = value.toLowerCase();
  for (const [connector, signals] of Object.entries(connectorSignals) as Array<[Connector, string[]]>) {
    if (signals.some((signal) => lower.includes(signal))) return connector;
  }
  return undefined;
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConnectorInputError(`${label} is required.`);
  }
  return value.trim();
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const requireObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConnectorInputError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const resultArray = (raw: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  }
  if (!raw || typeof raw !== 'object') return [];
  const object = raw as Record<string, unknown>;
  for (const key of ['results', 'items', 'messages', 'files', 'events', 'data']) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item));
    }
  }
  return [object];
};

const getString = (object: Record<string, unknown>, keys: string[], fallback = ''): string => {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
};

const getObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const normalizePerson = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'string' && value.length > 0) return { email: value };
  const object = getObject(value);
  if (!object) return undefined;
  return {
    name: object['name'] ?? object['displayName'],
    email: object['email'] ?? object['emailAddress'] ?? object['address']
  };
};

const normalizePeople = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizePerson)
    .filter((item): item is Record<string, unknown> => Boolean(item));
};

const normalizeResult = (connector: Connector, item: Record<string, unknown>): Record<string, unknown> => {
  if (connector === 'gmail') {
    return {
      id: getString(item, ['id', 'messageId']),
      threadId: getString(item, ['threadId', 'thread_id', 'thread']),
      subject: getString(item, ['subject', 'title'], 'Gmail message'),
      snippet: getString(item, ['snippet', 'bodySnippet', 'text', 'body']),
      date: item['date'] ?? item['internalDate'],
      from: normalizePerson(item['from'] ?? item['sender']),
      to: normalizePeople(item['to'] ?? item['recipients']),
      attachments: Array.isArray(item['attachments']) ? item['attachments'] : []
    };
  }
  if (connector === 'drive') {
    return {
      id: getString(item, ['id', 'fileId']),
      name: getString(item, ['name', 'title'], 'Drive file'),
      mimeType: item['mimeType'],
      webUrl: item['webUrl'] ?? item['webViewLink'] ?? item['url'],
      snippet: getString(item, ['snippet', 'text', 'description']),
      owner: normalizePerson(item['owner'] ?? item['owners']),
      sharedWith: normalizePeople(item['sharedWith']),
      sections: Array.isArray(item['sections']) ? item['sections'] : []
    };
  }
  return {
    id: getString(item, ['id', 'eventId']),
    title: getString(item, ['title', 'summary', 'name'], 'Calendar event'),
    description: getString(item, ['description', 'snippet']),
    start: item['start'] ?? item['startTime'],
    end: item['end'] ?? item['endTime'],
    location: item['location'],
    attendees: normalizePeople(item['attendees'])
  };
};

const defaultArguments = (
  action: ConnectorDispatchAction,
  query: string | undefined,
  parameters: Record<string, unknown>
): Record<string, unknown> => {
  if (action === 'fetch') {
    return {
      query,
      ...parameters
    };
  }
  return parameters;
};

export class HttpMcpToolClient implements McpToolClient {
  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {}
  ) {}

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...this.headers
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      })
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ConnectorConfigurationError(`MCP call failed with ${response.status}: ${text}`);
    }
    const jsonText = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .find((line) => line.startsWith('{')) ?? text;
    const payload = JSON.parse(jsonText) as Record<string, unknown>;
    if (payload['error']) {
      throw new ConnectorConfigurationError(`MCP call failed: ${JSON.stringify(payload['error'])}`);
    }
    return payload['result'] ?? payload;
  }
}

interface ComposioToolRouterSession {
  session_id?: string;
  mcp?: {
    url?: string;
  };
}

export class ComposioApiKeyMcpToolClient implements McpToolClient {
  private readonly sessions = new Map<string, Promise<HttpMcpToolClient>>();

  constructor(
    private readonly apiKey: string,
    private readonly options: {
      userId?: string;
      baseUrl?: string;
    } = {}
  ) {}

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    context?: { sessionId: string }
  ): Promise<unknown> {
    void context;
    const userId = this.options.userId;
    if (!userId) {
      throw new ConnectorConfigurationError('COMPOSIO_USER_ID is required when using COMPOSIO_API_KEY.');
    }
    const session = await this.sessionFor(userId);
    return session.callTool(toolName, args);
  }

  private sessionFor(userId: string): Promise<HttpMcpToolClient> {
    const cached = this.sessions.get(userId);
    if (cached) return cached;
    const created = this.createSession(userId);
    this.sessions.set(userId, created);
    return created;
  }

  private async createSession(userId: string): Promise<HttpMcpToolClient> {
    const baseUrl = this.options.baseUrl ?? 'https://backend.composio.dev';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/api/v3.1/tool_router/session`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        user_id: userId,
        toolkits: {
          enabled: allowedToolkits
        },
        tools: {
          gmail: {
            enabled: composioToolkitTools.gmail
          },
          googledrive: {
            enabled: composioToolkitTools.googledrive
          },
          googlecalendar: {
            enabled: composioToolkitTools.googlecalendar
          }
        },
        workbench: {
          enable: false,
          proxy_execution_enabled: false
        },
        manage_connections: {
          enable: true,
          enable_wait_for_connections: false,
          enable_connection_removal: false
        }
      })
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ConnectorConfigurationError(`Composio session creation failed with ${response.status}: ${text}`);
    }

    const payload = JSON.parse(text) as ComposioToolRouterSession;
    const mcpUrl = payload.mcp?.url;
    if (!mcpUrl) {
      throw new ConnectorConfigurationError('Composio session response did not include an MCP URL.');
    }

    return new HttpMcpToolClient(mcpUrl, {
      'x-api-key': this.apiKey
    });
  }
}

export const createMcpToolClientFromEnv = (): McpToolClient | undefined => {
  const url = optionalString(process.env['OPEN_BUBBLE_COMPOSIO_MCP_URL']);
  if (url) {
    const headers: Record<string, string> = {};
    const rawHeaders = optionalString(process.env['OPEN_BUBBLE_COMPOSIO_MCP_HEADERS']);
    if (rawHeaders) {
      const parsed = JSON.parse(rawHeaders) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') headers[key] = value;
      }
    }
    const token = optionalString(process.env['OPEN_BUBBLE_COMPOSIO_MCP_TOKEN']);
    if (token && !headers['authorization']) {
      headers['authorization'] = `Bearer ${token}`;
    }
    return new HttpMcpToolClient(url, headers);
  }

  const apiKey = optionalString(process.env['COMPOSIO_API_KEY']);
  if (apiKey) {
    const options: { userId?: string; baseUrl?: string } = {};
    const userId =
      optionalString(process.env['COMPOSIO_USER_ID']) ??
      optionalString(process.env['OPEN_BUBBLE_COMPOSIO_USER_ID']);
    const baseUrl = optionalString(process.env['OPEN_BUBBLE_COMPOSIO_API_BASE_URL']);
    if (userId) options.userId = userId;
    if (baseUrl) options.baseUrl = baseUrl;
    return new ComposioApiKeyMcpToolClient(apiKey, options);
  }
  return undefined;
};

export const normalizeMcpFetch = (
  request: ConnectorDispatchRequest,
  connector: Connector,
  mcpResult: unknown
): McpFetchResult => {
  const query = optionalString(request.query);
  const sourceRequestId = optionalString(request.sourceRequestId);
  const metadata: Record<string, unknown> = {
    connector,
    mcpTool: toolFor(connector, 'fetch'),
    redaction: 'snippet_only',
    userVisible: true,
    rawResultHash: createHash('sha256').update(JSON.stringify(mcpResult)).digest('hex')
  };
  const result: McpFetchResult = {
    sessionId: requireString(request.sessionId, 'sessionId'),
    connector,
    operation: 'fetch',
    fetchedAt: new Date().toISOString(),
    results: resultArray(mcpResult).map((item) => normalizeResult(connector, item)),
    metadata
  };
  if (query) result.query = query;
  if (sourceRequestId) result.sourceRequestId = sourceRequestId;
  return result;
};

export const dispatchConnectorTool = async (
  request: ConnectorDispatchRequest,
  client: McpToolClient | undefined
): Promise<ConnectorDispatchResult> => {
  if (!client) {
    throw new ConnectorConfigurationError('COMPOSIO_API_KEY or OPEN_BUBBLE_COMPOSIO_MCP_URL is required for connector dispatch.');
  }

  if (request.connector !== undefined && !isConnector(request.connector)) {
    throw new ConnectorInputError('connector must be gmail, drive, or calendar.');
  }
  if (request.action !== undefined && !isAction(request.action)) {
    throw new ConnectorInputError('action must be fetch, draft_email, or create_calendar_event.');
  }

  const action = request.action ?? 'fetch';
  const parameters = request.parameters ? requireObject(request.parameters, 'parameters') : {};
  const query = optionalString(request.query);
  const promptConnector = query ? inferConnector(query) : undefined;
  const actionConnector = connectorForAction(action);
  const connector = actionConnector ?? request.connector ?? promptConnector;

  if (!connector) {
    throw new ConnectorInputError('connector is required when the query does not imply Gmail, Drive, or Calendar.');
  }
  if (action === 'draft_email' && connector !== 'gmail') {
    throw new ConnectorInputError('draft_email is only available through Gmail.');
  }
  if (action === 'create_calendar_event' && connector !== 'calendar') {
    throw new ConnectorInputError('create_calendar_event is only available through Calendar.');
  }

  const tool = toolFor(connector, action);
  const args = defaultArguments(action, query, parameters);
  const sessionId = requireString(request.sessionId, 'sessionId');
  const mcpResult = await client.callTool(tool, args, { sessionId });
  const base = {
    sessionId,
    connector,
    action,
    tool,
    mcpResult
  };

  if (action === 'fetch') {
    return {
      ...base,
      kind: 'context_ingested',
      normalizedFetch: normalizeMcpFetch(request, connector, mcpResult)
    };
  }

  return {
    ...base,
    kind: 'action_executed'
  };
};
