import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { resolveFromRepoRoot } from './openapi.js';

export type ScreenMediaKind = 'image' | 'video';
export type TaskStatus = 'in_progress' | 'completed' | 'failed' | 'error';

export interface ScreenMediaMetadata {
  filename: string;
  mimeType: string;
  kind: ScreenMediaKind;
}

export interface PromptAudioMetadata {
  filename: string;
  mimeType: string;
}

export interface UploadedBinary<TMetadata> {
  buffer: Buffer;
  metadata: TMetadata;
}

export interface ParsedPromptRequest {
  screenMedia: UploadedBinary<ScreenMediaMetadata>;
  promptText?: string;
  promptAudio?: UploadedBinary<PromptAudioMetadata>;
}

export interface TaskFailure {
  code: string;
  message: string;
  repoId?: string;
  threadId?: string;
  turnId?: string;
}

export interface TaskResult {
  answer?: string;
  pullRequestUrl?: string;
  branchName?: string;
  commitSha?: string;
  repoId?: string;
  threadId?: string;
  turnId?: string;
  promptText?: string;
  promptAudio?: PromptAudioMetadata;
  screenMedia: ScreenMediaMetadata;
  completedAt: string;
}

export interface TaskStatusResponse {
  taskId: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  repoId?: string;
  threadId?: string;
  turnId?: string;
  result?: TaskResult;
  errorDetail?: TaskFailure;
}

export interface PromptAcceptedResponse {
  taskId: string;
  status: 'in_progress';
  createdAt: string;
  statusUrl: string;
}

export interface PromptTaskProcessorInput {
  taskId: string;
  taskDir: string;
  screenMedia: ScreenMediaMetadata;
  screenMediaPath: string;
  promptText?: string;
  promptAudio?: PromptAudioMetadata;
  promptAudioPath?: string;
  updateTask: (patch: TaskProgressUpdate) => Promise<void>;
}

export interface TaskProgressUpdate {
  repoId?: string;
  threadId?: string;
  turnId?: string;
}

export type PromptTaskProcessorOutcome =
  | {
      status: 'completed';
      result?: {
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
      errorDetail: TaskFailure;
    };

export type PromptTaskProcessor = (
  input: PromptTaskProcessorInput
) => Promise<PromptTaskProcessorOutcome>;

export interface PromptTaskManagerOptions {
  taskStoreRoot?: string;
  taskProcessor?: PromptTaskProcessor;
}

const taskFileName = 'task.json';
const inputFileName = 'input.json';
const screenMediaFileName = 'screen-media.bin';
const promptAudioFileName = 'prompt-audio.bin';

const defaultTaskStoreRoot = (): string =>
  resolveFromRepoRoot('apps', 'api', '.local', 'tasks');

const buildAnswer = (payload: {
  screenMedia: ScreenMediaMetadata;
  promptText?: string;
  promptAudio?: PromptAudioMetadata;
}): string => {
  const screenLabel =
    payload.screenMedia.kind === 'image' ? 'screenshot' : 'screen recording';

  if (payload.promptText && payload.promptAudio) {
    return `Dummy response for ${screenLabel} with text and raw audio prompt input.`;
  }

  if (payload.promptAudio) {
    return `Dummy response for ${screenLabel} with raw audio prompt input.`;
  }

  return `Dummy response for ${screenLabel} with text prompt input.`;
};

const defaultPromptTaskProcessor: PromptTaskProcessor = async ({
  screenMedia,
  promptText,
  promptAudio,
  updateTask
}) => {
  await updateTask({
    repoId: 'demo-repo',
    threadId: 'demo-thread',
    turnId: 'demo-turn'
  });

  return {
    status: 'completed',
    result: {
      answer: buildAnswer({
        screenMedia,
        ...(promptText ? { promptText } : {}),
        ...(promptAudio ? { promptAudio } : {})
      }),
      repoId: 'demo-repo',
      threadId: 'demo-thread',
      turnId: 'demo-turn'
    }
  };
};

const writeJson = async (
  filePath: string,
  payload: unknown
): Promise<void> => {
  const tempFilePath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tempFilePath, JSON.stringify(payload, null, 2));
  await rename(tempFilePath, filePath);
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Task processing failed.';

export class PromptTaskManager {
  readonly taskStoreRoot: string;
  readonly taskProcessor: PromptTaskProcessor;

  private constructor(options: Required<PromptTaskManagerOptions>) {
    this.taskStoreRoot = options.taskStoreRoot;
    this.taskProcessor = options.taskProcessor;
  }

  static async create(
    options: PromptTaskManagerOptions = {}
  ): Promise<PromptTaskManager> {
    const resolvedOptions: Required<PromptTaskManagerOptions> = {
      taskStoreRoot: options.taskStoreRoot ?? defaultTaskStoreRoot(),
      taskProcessor: options.taskProcessor ?? defaultPromptTaskProcessor
    };

    await mkdir(resolvedOptions.taskStoreRoot, { recursive: true });

    return new PromptTaskManager(resolvedOptions);
  }

  async createTask(
    payload: ParsedPromptRequest
  ): Promise<PromptAcceptedResponse> {
    const taskId = randomUUID();
    const createdAt = new Date().toISOString();
    const taskDir = path.join(this.taskStoreRoot, taskId);
    const initialTask: TaskStatusResponse = {
      taskId,
      status: 'in_progress',
      createdAt,
      updatedAt: createdAt
    };

    await mkdir(taskDir, { recursive: true });
    await this.persistTaskInput(taskDir, payload);
    await this.writeTask(taskId, initialTask);

    console.info(
      `[api] task ${taskId} persisted at ${taskDir} with screenMedia=${payload.screenMedia.metadata.kind}`
    );

    void this.runTask(initialTask, taskDir, payload);

    return {
      taskId,
      status: 'in_progress',
      createdAt,
      statusUrl: `/tasks/${taskId}`
    };
  }

  async getTask(taskId: string): Promise<TaskStatusResponse | undefined> {
    try {
      return await readJson<TaskStatusResponse>(this.getTaskFilePath(taskId));
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  private getTaskFilePath(taskId: string): string {
    return path.join(this.taskStoreRoot, taskId, taskFileName);
  }

  private async writeTask(
    taskId: string,
    payload: TaskStatusResponse
  ): Promise<void> {
    await writeJson(this.getTaskFilePath(taskId), payload);
  }

  private async mergeTask(
    taskId: string,
    patch: Partial<TaskStatusResponse>
  ): Promise<TaskStatusResponse> {
    const current = await readJson<TaskStatusResponse>(this.getTaskFilePath(taskId));
    const next: TaskStatusResponse = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    await this.writeTask(taskId, next);
    return next;
  }

  private async persistTaskInput(
    taskDir: string,
    payload: ParsedPromptRequest
  ): Promise<void> {
    await writeFile(
      path.join(taskDir, screenMediaFileName),
      payload.screenMedia.buffer
    );

    if (payload.promptAudio) {
      await writeFile(
        path.join(taskDir, promptAudioFileName),
        payload.promptAudio.buffer
      );
    }

    await writeJson(path.join(taskDir, inputFileName), {
      screenMedia: payload.screenMedia.metadata,
      promptText: payload.promptText,
      promptAudio: payload.promptAudio?.metadata
    });
  }

  private async runTask(
    task: TaskStatusResponse,
    taskDir: string,
    payload: ParsedPromptRequest
  ): Promise<void> {
    try {
      console.info(`[api] task ${task.taskId} background execution started`);
      const outcome = await this.taskProcessor({
        taskId: task.taskId,
        taskDir,
        screenMedia: payload.screenMedia.metadata,
        screenMediaPath: path.join(taskDir, screenMediaFileName),
        ...(payload.promptText ? { promptText: payload.promptText } : {}),
        ...(payload.promptAudio
          ? {
              promptAudio: payload.promptAudio.metadata,
              promptAudioPath: path.join(taskDir, promptAudioFileName)
            }
          : {})
        ,
        updateTask: async (patch) => {
          await this.mergeTask(task.taskId, patch);
        }
      });

      const completedAt = new Date().toISOString();

      if (outcome.status === 'failed') {
        console.warn(
          `[api] task ${task.taskId} failed: ${outcome.errorDetail.code} ${outcome.errorDetail.message}`
        );
        await this.mergeTask(task.taskId, {
          status: 'failed',
          ...(outcome.errorDetail.repoId ? { repoId: outcome.errorDetail.repoId } : {}),
          ...(outcome.errorDetail.threadId
            ? { threadId: outcome.errorDetail.threadId }
            : {}),
          ...(outcome.errorDetail.turnId ? { turnId: outcome.errorDetail.turnId } : {}),
          errorDetail: outcome.errorDetail
        });
        return;
      }

      await this.mergeTask(task.taskId, {
        status: 'completed',
        ...(outcome.result?.repoId ? { repoId: outcome.result.repoId } : {}),
        ...(outcome.result?.threadId ? { threadId: outcome.result.threadId } : {}),
        ...(outcome.result?.turnId ? { turnId: outcome.result.turnId } : {}),
        result: {
          screenMedia: payload.screenMedia.metadata,
          completedAt,
          ...(payload.promptText ? { promptText: payload.promptText } : {}),
          ...(payload.promptAudio
            ? { promptAudio: payload.promptAudio.metadata }
            : {}),
          ...outcome.result
        }
      });
      console.info(`[api] task ${task.taskId} completed`);
    } catch (error) {
      console.error(`[api] task ${task.taskId} crashed`, error);
      await this.mergeTask(task.taskId, {
        status: 'error',
        errorDetail: {
          code: 'task_error',
          message: getErrorMessage(error)
        }
      });
    }
  }
}

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  error.code === 'ENOENT';
