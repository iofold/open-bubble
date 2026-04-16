import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

export type RequestId = string | number;

export interface JsonRpcRequest {
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export type ServerNotification =
  | {
      method: 'error';
      params: {
        error: {
          message: string;
        };
      };
    }
  | {
      method: 'item/completed';
      params: {
        item: {
          type: string;
          text?: string;
        };
        threadId: string;
        turnId: string;
      };
    }
  | {
      method: 'turn/completed';
      params: {
        threadId: string;
        turn: {
          status: 'completed' | 'failed' | 'inProgress' | 'interrupted';
        };
      };
    }
  | {
      method: string;
      params?: unknown;
    };

interface JsonRpcSuccess<TResult> {
  id: RequestId;
  result: TResult;
}

interface JsonRpcFailure {
  id: RequestId;
  error: {
    code: number;
    message: string;
  };
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isJsonRpcSuccess = <TResult>(
  value: unknown
): value is JsonRpcSuccess<TResult> =>
  isObject(value) && 'id' in value && 'result' in value;

const isJsonRpcFailure = (value: unknown): value is JsonRpcFailure =>
  isObject(value) && 'id' in value && 'error' in value;

const isServerNotification = (value: unknown): value is ServerNotification =>
  isObject(value) && 'method' in value && !('id' in value);

const hasObjectParams = (
  notification: ServerNotification
): notification is ServerNotification & { params: Record<string, unknown> } =>
  isObject(notification.params);

export const isErrorNotification = (
  notification: ServerNotification
): notification is Extract<ServerNotification, { method: 'error' }> =>
  notification.method === 'error' &&
  hasObjectParams(notification) &&
  isObject(notification.params.error) &&
  typeof notification.params.error.message === 'string';

export const isItemCompletedNotification = (
  notification: ServerNotification
): notification is Extract<ServerNotification, { method: 'item/completed' }> =>
  notification.method === 'item/completed' &&
  hasObjectParams(notification) &&
  isObject(notification.params.item) &&
  typeof notification.params.item.type === 'string' &&
  (notification.params.item.text === undefined ||
    typeof notification.params.item.text === 'string') &&
  typeof notification.params.threadId === 'string' &&
  typeof notification.params.turnId === 'string';

export const isTurnCompletedNotification = (
  notification: ServerNotification
): notification is Extract<ServerNotification, { method: 'turn/completed' }> =>
  notification.method === 'turn/completed' &&
  hasObjectParams(notification) &&
  typeof notification.params.threadId === 'string' &&
  isObject(notification.params.turn) &&
  typeof notification.params.turn.status === 'string';

export class JsonRpcTransport {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<RequestId, PendingRequest>();
  private readonly listeners = new Set<(notification: ServerNotification) => void>();
  private nextId = 0;
  private stderr = '';

  constructor(command = 'codex', args: string[] = ['app-server']) {
    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const lineReader = readline.createInterface({
      input: this.process.stdout
    });

    lineReader.on('line', (line) => {
      this.handleLine(line);
    });

    this.process.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
    });

    this.process.on('exit', (code, signal) => {
      const detail = signal
        ? `signal ${signal}`
        : `exit code ${String(code ?? 'unknown')}`;
      const suffix = this.stderr.trim().length > 0
        ? `: ${this.stderr.trim()}`
        : '';
      const error = new Error(`codex app-server stopped with ${detail}${suffix}`);

      for (const pending of this.pending.values()) {
        pending.reject(error);
      }

      this.pending.clear();
    });
  }

  onNotification(listener: (notification: ServerNotification) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async request<TResult>(request: JsonRpcRequest): Promise<TResult> {
    const id = this.nextId++;
    const payload = {
      ...request,
      id
    };

    const result = await new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject
      });

      this.process.stdin.write(`${JSON.stringify(payload)}\n`);
    });

    return result;
  }

  notify(notification: JsonRpcNotification): void {
    this.process.stdin.write(`${JSON.stringify(notification)}\n`);
  }

  async close(): Promise<void> {
    if (this.process.killed) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.process.once('exit', () => resolve());
      this.process.kill();
    });
  }

  private handleLine(line: string): void {
    const parsed = JSON.parse(line) as unknown;

    if (isJsonRpcSuccess(parsed)) {
      const pending = this.pending.get(parsed.id);

      if (!pending) {
        return;
      }

      this.pending.delete(parsed.id);
      pending.resolve(parsed.result);
      return;
    }

    if (isJsonRpcFailure(parsed)) {
      const pending = this.pending.get(parsed.id);

      if (!pending) {
        return;
      }

      this.pending.delete(parsed.id);
      pending.reject(new Error(parsed.error.message));
      return;
    }

    if (isServerNotification(parsed)) {
      for (const listener of this.listeners) {
        listener(parsed);
      }
    }
  }
}
