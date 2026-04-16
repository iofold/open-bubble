import { constants } from 'node:fs';
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { ResponseItem } from '../generated/codex-app-server/ResponseItem.js';
import type { ThreadReadResponse } from '../generated/codex-app-server/v2/ThreadReadResponse.js';
import type { ThreadStartResponse } from '../generated/codex-app-server/v2/ThreadStartResponse.js';
import type { Turn } from '../generated/codex-app-server/v2/Turn.js';
import type { TurnStartResponse } from '../generated/codex-app-server/v2/TurnStartResponse.js';
import {
  isAgentMessageDeltaNotification,
  isErrorNotification,
  isItemCompletedNotification,
  isRawResponseItemCompletedNotification,
  isTurnCompletedNotification,
  JsonRpcTransport
} from './transport.js';
import type { RepoSelection } from './infer.js';

interface InitializeResponse {
  userAgent: string;
}

export interface GatewayScreenMedia {
  filename: string;
  kind: 'image';
  mimeType: string;
  path: string;
}

export interface GatewayProgressUpdate {
  threadId?: string;
  turnId?: string;
}

export interface GatewayPromptRequest {
  promptText: string;
  promptAudioPath?: string;
  repo: RepoSelection;
  screenMedia: GatewayScreenMedia;
  onProgress?: (update: GatewayProgressUpdate) => Promise<void> | void;
}

export interface GatewayPromptResult {
  answer: string;
  branchName: string;
  commitSha: string;
  prUrl: string;
  threadId: string;
  turnId: string;
}

export interface CodexPromptGateway {
  runPrompt(request: GatewayPromptRequest): Promise<GatewayPromptResult>;
}

interface FinalOutput {
  answer: string;
  branchName: string;
  commitSha: string;
  prUrl: string;
}

interface SpawnEnvironment {
  cleanup: () => Promise<void>;
  env: NodeJS.ProcessEnv;
}

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'branchName', 'commitSha', 'prUrl'],
  properties: {
    answer: {
      type: 'string'
    },
    branchName: {
      type: 'string'
    },
    commitSha: {
      type: 'string'
    },
    prUrl: {
      type: 'string'
    }
  }
};

const githubPrUrlPattern = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/u;
const pnpmPackageManagerPattern = /^pnpm@(?<version>.+)$/u;

const stripCodeFences = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/u, '')
    .replace(/\s*```$/u, '')
    .trim();
};

const parseFinalOutput = (value: string): FinalOutput => {
  const normalized = stripCodeFences(value);
  const parsed = JSON.parse(normalized) as FinalOutput;

  if (
    typeof parsed.answer !== 'string' ||
    typeof parsed.branchName !== 'string' ||
    typeof parsed.commitSha !== 'string' ||
    typeof parsed.prUrl !== 'string'
  ) {
    throw new Error('Codex returned an invalid final payload.');
  }

  if (!githubPrUrlPattern.test(parsed.prUrl)) {
    throw new Error(`Codex returned a non-GitHub PR URL: ${parsed.prUrl}`);
  }

  return parsed;
};

const isExecutable = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const findExecutableOnPath = async (
  command: string,
  pathValue: string | undefined
): Promise<string | undefined> => {
  if (!pathValue) {
    return undefined;
  }

  for (const directory of pathValue.split(delimiter)) {
    if (!directory) {
      continue;
    }

    const candidate = join(directory, command);
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return undefined;
};

export const readPinnedPnpmVersion = async (
  cwd: string
): Promise<string | undefined> => {
  try {
    const packageJson = await readFile(join(cwd, 'package.json'), 'utf8');
    const parsed = JSON.parse(packageJson) as {
      packageManager?: string;
    };
    const match = parsed.packageManager?.match(pnpmPackageManagerPattern);
    return match?.groups?.version;
  } catch {
    return undefined;
  }
};

const createPnpmShim = async (
  npxPath: string,
  version: string | undefined
): Promise<{ cleanup: () => Promise<void>; dir: string }> => {
  const dir = await mkdtemp(join(tmpdir(), 'open-bubble-pnpm-'));
  const shimPath = join(dir, 'pnpm');
  const packageSpec = version ? `pnpm@${version}` : 'pnpm';

  await writeFile(
    shimPath,
    `#!/bin/sh\nexec '${npxPath}' --yes '${packageSpec}' "$@"\n`,
    'utf8'
  );
  await chmod(shimPath, 0o755);

  return {
    dir,
    cleanup: async () => {
      await rm(dir, { force: true, recursive: true });
    }
  };
};

export const createSpawnEnvironment = async (
  cwd: string
): Promise<SpawnEnvironment> => {
  const env: NodeJS.ProcessEnv = {
    ...process.env
  };
  env.HUSKY = '0';
  const pathValue = env.PATH;
  const repoNodeModulesBin = join(cwd, 'node_modules', '.bin');
  const pathEntries = [
    repoNodeModulesBin,
    ...(pathValue ? [pathValue] : [])
  ];

  if (await findExecutableOnPath('pnpm', pathValue)) {
    env.PATH = pathEntries.join(delimiter);
    return {
      env,
      cleanup: async () => {}
    };
  }

  const npxPath = await findExecutableOnPath('npx', pathValue);
  if (!npxPath) {
    env.PATH = pathEntries.join(delimiter);
    return {
      env,
      cleanup: async () => {}
    };
  }

  const pnpmVersion = await readPinnedPnpmVersion(cwd);
  const pnpmShim = await createPnpmShim(npxPath, pnpmVersion);
  env.PATH = [pnpmShim.dir, ...pathEntries].join(delimiter);

  return {
    env,
    cleanup: pnpmShim.cleanup
  };
};

const buildPrompt = (request: GatewayPromptRequest): string => `
<role>
You are the Open Bubble coding lane. You are an ambient software agent running from the user's current screen.
</role>

<context>
- Inferred repository id: ${request.repo.id}
- Repository cwd: ${request.repo.cwd}
- A screenshot of the user's current screen is attached.
- The user may be showing a bug, unfinished feature, or code-related task on screen.
${request.promptAudioPath ? `- An untranscribed raw audio prompt is available at: ${request.promptAudioPath}` : '- No raw audio prompt file was provided.'}
</context>

<objective>
Infer the user's likely coding intent from the screenshot plus prompt text, then work autonomously in the provided repo.
Do not ask follow-up questions.
Make the smallest reasonable change that fully addresses the likely issue.
If the task is clearly a coding request, create a branch, commit your changes, push, and open a GitHub PR.
</objective>

<tool_persistence_rules>
- Inspect the codebase before editing.
- Prefer focused shell commands and targeted file reads.
- Use local git in the repo and use the gh CLI to create the PR.
- If unrelated broad repo hooks block push, you may use git push --no-verify after attempting a normal push.
</tool_persistence_rules>

<verification_loop>
- Run focused validation for the files you change.
- Do not claim success without at least one concrete verification step.
- Prefer narrow tests or typechecks over broad expensive suites when the change is localized.
</verification_loop>

<completeness_contract>
- Finish the task end-to-end when feasible.
- The desired artifact is a PR URL.
- The final user-facing response should be only the PR URL.
- Return strict JSON matching the required schema.
- Set answer to the PR URL only.
</completeness_contract>

<user_request>
${request.promptText}
</user_request>
`.trim();

const extractResponseMessageText = (item: ResponseItem): string | undefined => {
  if (item.type !== 'message') {
    return undefined;
  }

  const text = item.content
    .flatMap((contentItem) => {
      if (contentItem.type === 'output_text' || contentItem.type === 'input_text') {
        return [contentItem.text];
      }

      return [];
    })
    .join('')
    .trim();

  return text.length > 0 ? text : undefined;
};

const extractFinalMessageFromThread = (
  thread: ThreadReadResponse['thread'],
  turnId: string
): string | undefined => {
  const matchingTurn = thread.turns.find((turn: Turn) => turn.id === turnId);

  if (!matchingTurn) {
    return undefined;
  }

  for (const item of [...matchingTurn.items].reverse()) {
    if (item.type === 'agentMessage') {
      const text = item.text.trim();

      if (text.length > 0) {
        return text;
      }
    }
  }

  return undefined;
};

export class LocalCodexAppServerGateway implements CodexPromptGateway {
  constructor(
    private readonly options: {
      command?: string;
      args?: string[];
      timeoutMs?: number;
      model?: string;
      serviceName?: string;
      serviceTier?: 'auto' | 'default' | 'flex' | 'priority' | 'fast';
      effort?: 'minimal' | 'low' | 'medium' | 'high';
      sandbox?: 'danger-full-access' | 'workspace-write';
      logger?: Pick<typeof console, 'error' | 'info' | 'warn'>;
    } = {}
  ) {}

  async runPrompt(request: GatewayPromptRequest): Promise<GatewayPromptResult> {
    const spawnEnvironment = await createSpawnEnvironment(request.repo.cwd);
    const transport = new JsonRpcTransport(
      this.options.command ?? 'codex',
      this.options.args ?? [
        'app-server',
        '-c',
        'model="gpt-5.4"',
        '-c',
        'model_reasoning_effort="medium"',
        '-c',
        'service_tier="fast"'
      ],
      {
        cwd: request.repo.cwd,
        env: spawnEnvironment.env
      }
    );
    const timeoutMs = this.options.timeoutMs ?? 10 * 60 * 1000;
    const logger = this.options.logger ?? console;

    const streamedAgentMessages = new Map<string, string>();
    let finalAgentMessage: string | undefined;
    let activeThreadId: string | undefined;
    let activeTurnId: string | undefined;

    const waitForCompletion = new Promise<Turn>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for Codex after ${String(timeoutMs)}ms.`));
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timer);
        unsubscribeNotifications();
        unsubscribeExit();
      };

      const rejectOnce = (error: Error): void => {
        cleanup();
        reject(error);
      };

      const resolveOnce = (turn: Turn): void => {
        cleanup();
        resolve(turn);
      };

      const unsubscribeExit = transport.onExit((error) => {
        rejectOnce(error);
      });

      const unsubscribeNotifications = transport.onNotification((notification) => {
        if (isErrorNotification(notification)) {
          rejectOnce(new Error(notification.params.error.message));
          return;
        }

        if (
          activeThreadId &&
          'threadId' in notification.params &&
          notification.params.threadId !== activeThreadId
        ) {
          return;
        }

        if (
          isAgentMessageDeltaNotification(notification) &&
          (!activeTurnId || notification.params.turnId === activeTurnId)
        ) {
          const previous = streamedAgentMessages.get(notification.params.itemId) ?? '';
          const next = `${previous}${notification.params.delta}`;
          streamedAgentMessages.set(notification.params.itemId, next);
          finalAgentMessage = next.trim().length > 0 ? next : finalAgentMessage;
          return;
        }

        if (
          isItemCompletedNotification(notification) &&
          (!activeTurnId || notification.params.turnId === activeTurnId) &&
          notification.params.item.type === 'agentMessage'
        ) {
          const text = notification.params.item.text.trim();

          if (text.length > 0) {
            streamedAgentMessages.set(notification.params.item.id, text);
            finalAgentMessage = text;
          }

          return;
        }

        if (
          isRawResponseItemCompletedNotification(notification) &&
          (!activeTurnId || notification.params.turnId === activeTurnId)
        ) {
          const rawText = extractResponseMessageText(notification.params.item);

          if (rawText) {
            finalAgentMessage = rawText;
          }

          return;
        }

        if (isTurnCompletedNotification(notification)) {
          if (activeTurnId && notification.params.turn.id !== activeTurnId) {
            return;
          }

          if (notification.params.turn.status !== 'completed') {
            const errorMessage =
              notification.params.turn.error?.message ??
              `Codex turn ended with status "${notification.params.turn.status}".`;
            rejectOnce(new Error(errorMessage));
            return;
          }

          resolveOnce(notification.params.turn);
        }
      });
    });

    try {
      await transport.request<InitializeResponse>({
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'open_bubble',
            title: 'Open Bubble',
            version: '0.1.0'
          },
          capabilities: null
        }
      });

      transport.notify({
        method: 'initialized'
      });

      const threadResponse = await transport.request<ThreadStartResponse>({
        method: 'thread/start',
        params: {
          model: this.options.model ?? 'gpt-5.4',
          serviceTier: this.options.serviceTier ?? 'fast',
          cwd: request.repo.cwd,
          approvalPolicy: 'never',
          sandbox: this.options.sandbox ?? 'danger-full-access',
          serviceName: this.options.serviceName ?? 'open_bubble',
          experimentalRawEvents: false,
          persistExtendedHistory: false
        }
      });

      activeThreadId = threadResponse.thread.id;
      if (request.onProgress) {
        await request.onProgress({
          threadId: activeThreadId
        });
      }

      logger.info(
        `[codex-app-server] started thread ${activeThreadId} for repo ${request.repo.id}`
      );

      const turnResponse = await transport.request<TurnStartResponse>({
        method: 'turn/start',
        params: {
          threadId: activeThreadId,
          input: [
            {
              type: 'text',
              text: buildPrompt(request),
              text_elements: []
            },
            {
              type: 'localImage',
              path: request.screenMedia.path
            }
          ],
          model: this.options.model ?? 'gpt-5.4',
          serviceTier: this.options.serviceTier ?? 'fast',
          effort: this.options.effort ?? 'medium',
          outputSchema
        }
      });

      activeTurnId = turnResponse.turn.id;
      if (request.onProgress) {
        await request.onProgress({
          threadId: activeThreadId,
          turnId: activeTurnId
        });
      }

      logger.info(
        `[codex-app-server] started turn ${activeTurnId} on thread ${activeThreadId}`
      );

      await waitForCompletion;

      if (!finalAgentMessage && activeThreadId && activeTurnId) {
        const threadSnapshot = await transport.request<ThreadReadResponse>({
          method: 'thread/read',
          params: {
            threadId: activeThreadId,
            includeTurns: true
          }
        });

        finalAgentMessage = extractFinalMessageFromThread(
          threadSnapshot.thread,
          activeTurnId
        );
      }

      if (!finalAgentMessage) {
        const fallback = [...streamedAgentMessages.values()].at(-1);
        finalAgentMessage = fallback?.trim().length ? fallback : finalAgentMessage;
      }

      if (!activeThreadId || !activeTurnId || !finalAgentMessage?.trim()) {
        throw new Error('Codex finished without a final agent message.');
      }

      const output = parseFinalOutput(finalAgentMessage);

      return {
        ...output,
        threadId: activeThreadId,
        turnId: activeTurnId
      };
    } catch (error) {
      logger.error('[codex-app-server] prompt run failed', error);
      throw error;
    } finally {
      await transport.close();
      await spawnEnvironment.cleanup();
    }
  }
}
