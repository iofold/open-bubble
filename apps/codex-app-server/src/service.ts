import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import {
  inferRepoFromPrompt,
  type RepoMapping,
  type RepoSelection
} from './infer.js';
import {
  LocalCodexAppServerGateway,
  type CodexPromptGateway,
  type GatewayScreenMedia
} from './gateway.js';
import { loadRepoMappings } from './config.js';

const execFileAsync = promisify(execFile);
const githubPrUrlPattern = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/u;

export interface PromptExecutionRequest {
  promptText: string;
  promptAudioPath?: string;
  screenMedia: GatewayScreenMedia;
}

export interface PromptExecutionResult {
  answer: string;
  branchName: string;
  commitSha: string;
  prUrl: string;
  repoId: string;
  threadId: string;
  turnId: string;
}

export interface PromptExecutor {
  executePrompt(request: PromptExecutionRequest): Promise<PromptExecutionResult>;
}

export interface PromptTaskProgressUpdate {
  repoId?: string;
  threadId?: string;
  turnId?: string;
}

export interface PromptTaskProcessorInput {
  taskId: string;
  taskDir: string;
  screenMedia: {
    filename: string;
    mimeType: string;
    kind: 'image' | 'video';
  };
  screenMediaPath: string;
  promptText?: string;
  promptAudio?: {
    filename: string;
    mimeType: string;
  };
  promptAudioPath?: string;
  updateTask: (patch: PromptTaskProgressUpdate) => Promise<void>;
}

export type PromptTaskProcessorOutcome =
  | {
      status: 'completed';
      result: {
        answer?: string;
        pullRequestUrl?: string;
        branchName?: string;
        commitSha?: string;
        repoId?: string;
        threadId?: string;
        turnId?: string;
      };
    }
  | {
      status: 'failed';
      errorDetail: {
        code: string;
        message: string;
        repoId?: string;
        threadId?: string;
        turnId?: string;
      };
    };

export type PromptTaskProcessor = (
  input: PromptTaskProcessorInput
) => Promise<PromptTaskProcessorOutcome>;

export interface PromptOrchestratorOptions {
  inferRepo: (promptText: string) => RepoSelection;
  gateway: CodexPromptGateway;
  logger?: Pick<typeof console, 'error' | 'info' | 'warn'>;
}

interface VerifiedPullRequest {
  url: string;
  branchName?: string;
}

class PromptTaskFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: PromptTaskProgressUpdate = {}
  ) {
    super(message);
    this.name = 'PromptTaskFailure';
  }
}

const runCommand = async (
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> =>
  execFileAsync(command, args, {
    cwd,
    encoding: 'utf8'
  });

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown command failure.';

const ensureRepoIsReady = async (repo: RepoSelection): Promise<void> => {
  await access(repo.cwd, constants.R_OK);

  let gitCheck: { stdout: string; stderr: string };

  try {
    gitCheck = await runCommand(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      repo.cwd
    );
  } catch (error) {
    throw new PromptTaskFailure(
      'repo_not_git',
      `Mapped repo "${repo.id}" is not a git worktree: ${getErrorMessage(error)}`,
      { repoId: repo.id }
    );
  }

  if (gitCheck.stdout.trim() !== 'true') {
    throw new PromptTaskFailure(
      'repo_not_git',
      `Mapped repo "${repo.id}" is not a git worktree.`,
      { repoId: repo.id }
    );
  }

  const gitStatus = await runCommand('git', ['status', '--short'], repo.cwd);

  if (gitStatus.stdout.trim().length > 0) {
    throw new PromptTaskFailure(
      'repo_dirty',
      `Mapped repo "${repo.id}" has uncommitted changes.`,
      { repoId: repo.id }
    );
  }

  try {
    await runCommand('git', ['remote', 'get-url', 'origin'], repo.cwd);
  } catch (error) {
    throw new PromptTaskFailure(
      'repo_remote_missing',
      `Mapped repo "${repo.id}" does not have a usable origin remote: ${getErrorMessage(error)}`,
      { repoId: repo.id }
    );
  }

  try {
    await runCommand('gh', ['auth', 'status'], repo.cwd);
  } catch (error) {
    throw new PromptTaskFailure(
      'github_auth_failed',
      `gh auth status failed: ${getErrorMessage(error)}`,
      { repoId: repo.id }
    );
  }
};

const getHeadCommitSha = async (cwd: string): Promise<string> => {
  const result = await runCommand('git', ['rev-parse', 'HEAD'], cwd);
  return result.stdout.trim();
};

const verifyPullRequest = async (
  cwd: string,
  prUrl: string
): Promise<VerifiedPullRequest> => {
  if (!githubPrUrlPattern.test(prUrl)) {
    throw new PromptTaskFailure('invalid_pr_url', `Invalid PR URL: ${prUrl}`);
  }

  const result = await runCommand(
    'gh',
    ['pr', 'view', prUrl, '--json', 'url,headRefName'],
    cwd
  );
  const parsed = JSON.parse(result.stdout) as {
    url?: string;
    headRefName?: string;
  };

  if (typeof parsed.url !== 'string' || !githubPrUrlPattern.test(parsed.url)) {
    throw new PromptTaskFailure('pr_not_found', `Unable to verify PR URL: ${prUrl}`);
  }

  return {
    url: parsed.url,
    ...(typeof parsed.headRefName === 'string'
      ? { branchName: parsed.headRefName }
      : {})
  };
};

const requirePromptText = (
  request: PromptExecutionRequest
): string => {
  const promptText = request.promptText.trim();

  if (promptText.length === 0) {
    throw new PromptTaskFailure(
      'prompt_required',
      'promptText is required for Codex execution.'
    );
  }

  return promptText;
};

const requireImageScreenMedia = (
  input: PromptTaskProcessorInput
): GatewayScreenMedia => {
  if (input.screenMedia.kind !== 'image') {
    throw new PromptTaskFailure(
      'screen_media_unsupported',
      'Only image screenMedia is supported in this Codex workflow right now.'
    );
  }

  return {
    ...input.screenMedia,
    kind: 'image',
    path: input.screenMediaPath
  };
};

export const createPromptOrchestrator = (
  options: PromptOrchestratorOptions
): PromptExecutor => ({
  async executePrompt(request): Promise<PromptExecutionResult> {
    const promptText = requirePromptText(request);
    const repo = options.inferRepo(promptText);
    const result = await options.gateway.runPrompt({
      promptText,
      repo,
      screenMedia: request.screenMedia,
      ...(request.promptAudioPath ? { promptAudioPath: request.promptAudioPath } : {})
    });

    return {
      ...result,
      repoId: repo.id
    };
  }
});

export const createPromptExecutorFromMappings = (
  mappings: RepoMapping[],
  gateway: CodexPromptGateway = new LocalCodexAppServerGateway()
): PromptExecutor =>
  createPromptOrchestrator({
    inferRepo: (promptText) => inferRepoFromPrompt(promptText, mappings),
    gateway
  });

export const createConfiguredPromptExecutor = async (): Promise<PromptExecutor> => {
  const mappings = await loadRepoMappings();
  return createPromptExecutorFromMappings(mappings);
};

export const createPromptTaskProcessorFromMappings = (
  mappings: RepoMapping[],
  gateway: CodexPromptGateway = new LocalCodexAppServerGateway({
    model: 'gpt-5.4',
    serviceTier: 'fast',
    effort: 'medium'
  }),
  logger: Pick<typeof console, 'error' | 'info' | 'warn'> = console
): PromptTaskProcessor =>
  async (input) => {
    const progress: PromptTaskProgressUpdate = {};

    try {
      const screenMedia = requireImageScreenMedia(input);
      const promptText = requirePromptText({
        promptText: input.promptText ?? '',
        screenMedia,
        ...(input.promptAudioPath ? { promptAudioPath: input.promptAudioPath } : {})
      });
      const repo = inferRepoFromPrompt(promptText, mappings);
      progress.repoId = repo.id;

      await input.updateTask({
        repoId: repo.id
      });

      logger.info(
        `[codex-app-server] task ${input.taskId} mapped to repo ${repo.id} (${repo.cwd})`
      );

      await ensureRepoIsReady(repo);

      const result = await gateway.runPrompt({
        promptText,
        repo,
        screenMedia,
        ...(input.promptAudioPath ? { promptAudioPath: input.promptAudioPath } : {}),
        onProgress: async (update) => {
          Object.assign(progress, update);
          await input.updateTask({
            repoId: repo.id,
            ...update
          });
        }
      });

      progress.threadId = result.threadId;
      progress.turnId = result.turnId;

      const verifiedPr = await verifyPullRequest(repo.cwd, result.prUrl);
      const commitSha = await getHeadCommitSha(repo.cwd);

      return {
        status: 'completed',
        result: {
          answer: result.answer,
          pullRequestUrl: verifiedPr.url,
          branchName: verifiedPr.branchName ?? result.branchName,
          commitSha,
          repoId: repo.id,
          threadId: result.threadId,
          turnId: result.turnId
        }
      };
    } catch (error) {
      if (error instanceof PromptTaskFailure) {
        logger.warn(
          `[codex-app-server] task ${input.taskId} failed: ${error.code} ${error.message}`
        );
        return {
          status: 'failed',
          errorDetail: {
            code: error.code,
            message: error.message,
            ...progress,
            ...error.details
          }
        };
      }

      logger.error(`[codex-app-server] task ${input.taskId} crashed`, error);
      throw error;
    }
  };

export const createConfiguredPromptTaskProcessor = async (): Promise<PromptTaskProcessor> => {
  const mappings = await loadRepoMappings();
  return createPromptTaskProcessorFromMappings(mappings);
};

export type { CodexPromptGateway } from './gateway.js';
