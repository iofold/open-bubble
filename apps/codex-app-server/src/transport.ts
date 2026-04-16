import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import type { ServerNotification as AppServerNotification } from '../generated/codex-app-server/ServerNotification.js';

export type RequestId = string | number;
export type ServerNotification = AppServerNotification;

export interface JsonRpcRequest {
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

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
  isObject(value) && typeof value['method'] === 'string' && !('id' in value);

export const isErrorNotification = (
  notification: ServerNotification
): notification is Extract<ServerNotification, { method: 'error' }> =>
  notification.method === 'error';

export const isItemCompletedNotification = (
  notification: ServerNotification
): notification is Extract<ServerNotification, { method: 'item/completed' }> =>
  notification.method === 'item/completed';

export const isAgentMessageDeltaNotification = (
  notification: ServerNotification
): notification is Extract<
  ServerNotification,
  { method: 'item/agentMessage/delta' }
> => notification.method === 'item/agentMessage/delta';

export const isRawResponseItemCompletedNotification = (
  notification: ServerNotification
): notification is Extract<
  ServerNotification,
  { method: 'rawResponseItem/completed' }
> => notification.method === 'rawResponseItem/completed';

export const isTurnCompletedNotification = (
  notification: ServerNotification
): notification is Extract<ServerNotification, { method: 'turn/completed' }> =>
  notification.method === 'turn/completed';

export class JsonRpcTransport {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<RequestId, PendingRequest>();
  private readonly listeners = new Set<(notification: ServerNotification) => void>();
  private readonly exitListeners = new Set<(error: Error) => void>();
  private readonly lineReader: readline.Interface;
  private nextId = 0;
  private stderr = '';
  private exitError: Error | undefined;
  private closing = false;

  constructor(
    command = 'codex',
    args: string[] = ['app-server'],
    options: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    } = {}
  ) {
    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: options.env } : {})
    });

    this.lineReader = readline.createInterface({
      input: this.process.stdout
    });

    this.lineReader.on('line', (line) => {
      this.handleLine(line);
    });

    this.process.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
    });

    this.process.on('error', (error) => {
      this.failTransport(error);
    });

    this.process.on('exit', (code, signal) => {
      if (this.closing && this.pending.size === 0) {
        return;
      }

      const detail = signal
        ? `signal ${signal}`
        : `exit code ${String(code ?? 'unknown')}`;
      const suffix =
        this.stderr.trim().length > 0 ? `: ${this.stderr.trim()}` : '';
      this.failTransport(
        new Error(`codex app-server stopped with ${detail}${suffix}`)
      );
    });
  }

  onNotification(listener: (notification: ServerNotification) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onExit(listener: (error: Error) => void): () => void {
    if (this.exitError) {
      listener(this.exitError);
      return () => {};
    }

    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  async request<TResult>(request: JsonRpcRequest): Promise<TResult> {
    if (this.exitError) {
      throw this.exitError;
    }

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

      this.writeLine(payload, reject);
    });

    return result;
  }

  notify(notification: JsonRpcNotification): void {
    if (this.exitError) {
      throw this.exitError;
    }

    this.writeLine(notification);
  }

  async close(): Promise<void> {
    this.closing = true;
    this.lineReader.close();

    if (this.process.exitCode !== null || this.process.killed) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.process.once('exit', () => resolve());
      this.process.kill();
    });
  }

  private writeLine(
    payload: JsonRpcRequest | JsonRpcNotification,
    onError?: (error: Error) => void
  ): void {
    const line = `${JSON.stringify(payload)}\n`;

    this.process.stdin.write(line, (error) => {
      if (!error) {
        return;
      }

      const writeError =
        error instanceof Error
          ? error
          : new Error('Failed to write to codex app-server stdin.');
      this.failTransport(writeError);
      onError?.(writeError);
    });
  }

  private handleLine(line: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      const parseError =
        error instanceof Error
          ? error
          : new Error('Received invalid JSON from codex app-server.');
      this.failTransport(parseError);
      return;
    }

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

  private failTransport(error: Error): void {
    if (this.exitError) {
      return;
    }

    this.exitError = error;

    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();

    for (const listener of this.exitListeners) {
      listener(error);
    }

    this.exitListeners.clear();
  }
}
