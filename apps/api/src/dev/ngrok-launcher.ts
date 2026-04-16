import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const apiBaseUrlEnvKey = 'OPEN_BUBBLE_API_BASE_URL';
export const ngrokAuthtokenEnvKey = 'NGROK_AUTHTOKEN';
export const ngrokTunnelName = 'open-bubble-api';

const defaultApiHost = '127.0.0.1';
const defaultApiPort = 3000;
const defaultNgrokApiUrl = 'http://127.0.0.1:4040/api/tunnels';
const startupTimeoutMs = 20_000;
const pollIntervalMs = 500;

type BufferedChildProcess = {
  child: ReturnType<typeof spawn>;
  name: string;
  output: string[];
};

type ExitDetails = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type NgrokTunnel = {
  name?: string;
  public_url?: string;
};

export type NgrokTunnelList = {
  tunnels?: NgrokTunnel[];
};

export const upsertEnvVariable = (
  content: string,
  key: string,
  value: string
): string => {
  const normalized = content.replace(/\r\n/g, '\n');
  const hasTrailingNewline = normalized.endsWith('\n');
  const baseLines = normalized === '' ? [] : normalized.split('\n');

  if (hasTrailingNewline) {
    baseLines.pop();
  }

  const nextLines: string[] = [];
  let didReplace = false;

  for (const line of baseLines) {
    if (line.startsWith(`${key}=`)) {
      if (!didReplace) {
        nextLines.push(`${key}=${value}`);
        didReplace = true;
      }

      continue;
    }

    nextLines.push(line);
  }

  if (!didReplace) {
    nextLines.push(`${key}=${value}`);
  }

  return `${nextLines.join('\n')}\n`;
};

export const readEnvVariable = (
  content: string,
  key: string
): string | undefined => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    if (!trimmed.startsWith(`${key}=`)) {
      continue;
    }

    const rawValue = trimmed.slice(key.length + 1).trim();

    if (
      rawValue.length >= 2 &&
      ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'")))
    ) {
      return rawValue.slice(1, -1);
    }

    return rawValue;
  }

  return undefined;
};

export const selectPublicTunnelUrl = (
  payload: NgrokTunnelList,
  preferredName: string
): string | undefined => {
  const tunnels = payload.tunnels ?? [];
  const preferred = tunnels.filter((tunnel) => tunnel.name === preferredName);
  const candidates = preferred.length > 0 ? preferred : tunnels;

  return (
    candidates.find((tunnel) => tunnel.public_url?.startsWith('https://'))
      ?.public_url ??
    candidates.find((tunnel) => typeof tunnel.public_url === 'string')?.public_url
  );
};

const resolveApiDirectory = (): string =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const resolveRepoRoot = (apiDirectory: string): string =>
  path.resolve(apiDirectory, '..', '..');

const resolveTsxBinary = (apiDirectory: string): string =>
  path.join(
    apiDirectory,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );

const sleep = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

const readFileIfExists = async (filePath: string): Promise<string> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }

    throw error;
  }
};

const ensureExecutableExists = async (filePath: string): Promise<void> => {
  await access(filePath, fsConstants.X_OK);
};

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return defaultApiPort;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultApiPort;
};

const createBufferedChild = (
  name: string,
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  }
): BufferedChildProcess => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const output: string[] = [];
  const append = (chunk: Buffer): void => {
    output.push(chunk.toString('utf8'));

    if (output.length > 40) {
      output.shift();
    }
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  return {
    child,
    name,
    output
  };
};

const waitForChildExit = (child: BufferedChildProcess): Promise<ExitDetails> =>
  new Promise((resolve) => {
    child.child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });

const describeChildFailure = (
  child: BufferedChildProcess,
  exit: ExitDetails
): string => {
  const reason =
    exit.code !== null
      ? `exit code ${exit.code}`
      : `signal ${exit.signal ?? 'unknown'}`;
  const output = child.output.join('').trim();

  return output === ''
    ? `${child.name} stopped with ${reason}.`
    : `${child.name} stopped with ${reason}.\n\n${output}`;
};

const stopChild = async (
  child: BufferedChildProcess | undefined
): Promise<void> => {
  if (!child || child.child.killed || child.child.exitCode !== null) {
    return;
  }

  child.child.kill('SIGTERM');

  const timedOut = await Promise.race([
    waitForChildExit(child).then(() => false),
    sleep(3_000).then(() => true)
  ]);

  if (timedOut) {
    child.child.kill('SIGKILL');
    await waitForChildExit(child);
  }
};

const waitForHealth = async (
  apiBaseUrl: string,
  server: BufferedChildProcess
): Promise<void> => {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        describeChildFailure(server, {
          code: server.child.exitCode,
          signal: server.child.signalCode
        })
      );
    }

    try {
      const response = await fetch(`${apiBaseUrl}/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for the API server at ${apiBaseUrl}/health.\n\n${server.output.join('').trim()}`
  );
};

const waitForTunnelUrl = async (
  ngrok: BufferedChildProcess,
  preferredName: string
): Promise<string> => {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (ngrok.child.exitCode !== null) {
      throw new Error(
        describeChildFailure(ngrok, {
          code: ngrok.child.exitCode,
          signal: ngrok.child.signalCode
        })
      );
    }

    try {
      const response = await fetch(defaultNgrokApiUrl);

      if (response.ok) {
        const payload = (await response.json()) as NgrokTunnelList;
        const publicUrl = selectPublicTunnelUrl(payload, preferredName);

        if (publicUrl) {
          return publicUrl;
        }
      }
    } catch {
      // ngrok is still starting.
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    [
      'Timed out waiting for ngrok to publish a public URL.',
      'Set NGROK_AUTHTOKEN in the repo-level .env or run `ngrok config add-authtoken <token>` once if ngrok is not configured yet.',
      ngrok.output.join('').trim()
    ]
      .filter((part) => part !== '')
      .join('\n\n')
  );
};

const startApiServer = async (
  apiDirectory: string,
  host: string,
  port: number
): Promise<BufferedChildProcess> => {
  const tsxBinary = resolveTsxBinary(apiDirectory);
  await ensureExecutableExists(tsxBinary);

  return createBufferedChild('API server', tsxBinary, ['src/server.ts'], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port)
    }
  });
};

const startNgrok = (
  repoRoot: string,
  port: number,
  authtoken: string | undefined
): BufferedChildProcess => {
  const args = [
    'http',
    String(port),
    '--name',
    ngrokTunnelName,
    '--log',
    'stdout',
    '--log-format',
    'json'
  ];

  if (authtoken) {
    args.push('--authtoken', authtoken);
  }

  return createBufferedChild('ngrok', 'ngrok', args, {
    cwd: repoRoot,
    env: process.env
  });
};

const waitForRuntimeShutdown = async (
  server: BufferedChildProcess,
  ngrok: BufferedChildProcess
): Promise<void> => {
  const result = await Promise.race([
    waitForChildExit(server).then((exit) => ({
      child: server,
      exit
    })),
    waitForChildExit(ngrok).then((exit) => ({
      child: ngrok,
      exit
    }))
  ]);

  throw new Error(describeChildFailure(result.child, result.exit));
};

export const runApiNgrokLauncher = async (): Promise<void> => {
  const apiDirectory = resolveApiDirectory();
  const repoRoot = resolveRepoRoot(apiDirectory);
  const envPath = path.join(repoRoot, '.env');
  const envContent = await readFileIfExists(envPath);

  const host = process.env['HOST'] ?? readEnvVariable(envContent, 'HOST') ?? defaultApiHost;
  const port = parsePort(
    process.env['PORT'] ?? readEnvVariable(envContent, 'PORT')
  );
  const ngrokAuthtoken =
    process.env[ngrokAuthtokenEnvKey] ??
    readEnvVariable(envContent, ngrokAuthtokenEnvKey);
  const localApiBaseUrl = `http://${defaultApiHost}:${port}`;

  let server: BufferedChildProcess | undefined;
  let ngrok: BufferedChildProcess | undefined;
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await Promise.all([stopChild(ngrok), stopChild(server)]);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });

  try {
    server = await startApiServer(apiDirectory, host, port);
    await waitForHealth(localApiBaseUrl, server);

    ngrok = startNgrok(repoRoot, port, ngrokAuthtoken);
    const publicUrl = await waitForTunnelUrl(ngrok, ngrokTunnelName);

    await writeFile(
      envPath,
      upsertEnvVariable(envContent, apiBaseUrlEnvKey, publicUrl),
      'utf8'
    );

    process.stdout.write(`${publicUrl}\n`);
    process.stderr.write(
      `Synced ${apiBaseUrlEnvKey} in ${envPath}. Press Ctrl+C to stop the API server and ngrok.\n`
    );

    await waitForRuntimeShutdown(server, ngrok);
  } catch (error) {
    await Promise.all([stopChild(ngrok), stopChild(server)]);

    if (shuttingDown) {
      return;
    }

    const message =
      error instanceof Error ? error.message : 'Unknown launcher failure.';

    throw new Error(message);
  }
};
