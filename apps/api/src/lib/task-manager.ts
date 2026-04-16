import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
}

export interface TaskResult {
  answer?: string;
  pullRequestUrl?: string;
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
}

export type PromptTaskProcessorOutcome =
  | {
      status: 'completed';
      result?: {
        answer?: string;
        pullRequestUrl?: string;
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

const parseDelayMs = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
};

const getSimulatedDelayMs = (): number => {
  const exactDelay = parseDelayMs(process.env['OPEN_BUBBLE_PROMPT_DELAY_MS']);
  if (exactDelay !== undefined) {
    return exactDelay;
  }

  const minDelay = parseDelayMs(process.env['OPEN_BUBBLE_PROMPT_DELAY_MIN_MS']);
  const maxDelay = parseDelayMs(process.env['OPEN_BUBBLE_PROMPT_DELAY_MAX_MS']);

  if (minDelay !== undefined && maxDelay !== undefined) {
    if (maxDelay <= minDelay) {
      return minDelay;
    }

    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  }

  return 0;
};

const isDemoModeEnabled = (): boolean =>
  process.env['OPEN_BUBBLE_DEMO_MODE'] === '1';

const normalizePrompt = (promptText: string | undefined): string =>
  promptText?.trim().toLowerCase() ?? '';

const buildInsuranceAnswer = (): string =>
  [
    'Insurance policy details',
    'Policy number: OBI-4837-1192-AX',
    'Provider: Meridian Mutual Assurance',
    'Plan: Premier Comprehensive',
    'Member ID: MM-90214478',
    'Support: +1 (800) 555-0148'
  ].join('\n');

const buildCalendarAnswer = (): string =>
  [
    'Calendar event created.',
    'Title: Meeting with Abhinav',
    'When: Wednesday, 3:00 PM',
    'Calendar: Gmail / Google Calendar',
    'Status: Confirmed and ready to send.'
  ].join('\n');

const buildDemoAnswer = (promptText: string | undefined): string | undefined => {
  const normalizedPrompt = normalizePrompt(promptText);

  if (!normalizedPrompt) {
    return undefined;
  }

  if (normalizedPrompt.includes('are we ready to demo')) {
    return "Umm... sure, ready for a demo. Just don't sell it to the Pentagon yet.";
  }

  const wantsCalendarAction =
    normalizedPrompt.includes('book') ||
    normalizedPrompt.includes('calendar') ||
    normalizedPrompt.includes('add it') ||
    normalizedPrompt.includes('add this');

  if (wantsCalendarAction) {
    return buildCalendarAnswer();
  }

  const wantsInsuranceDetails =
    normalizedPrompt.includes('insurance') ||
    normalizedPrompt.includes('policy') ||
    normalizedPrompt.includes('policy number');

  if (wantsInsuranceDetails) {
    return buildInsuranceAnswer();
  }

  return undefined;
};

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
  promptAudio
}) => {
  const simulatedDelayMs = getSimulatedDelayMs();

  if (simulatedDelayMs > 0) {
    await delay(simulatedDelayMs);
  }

  const demoAnswer = isDemoModeEnabled()
    ? buildDemoAnswer(promptText)
    : undefined;

  return {
    status: 'completed',
    result: {
      answer:
        demoAnswer ??
        buildAnswer({
          screenMedia,
          ...(promptText ? { promptText } : {}),
          ...(promptAudio ? { promptAudio } : {})
        })
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
      });

      const completedAt = new Date().toISOString();

      if (outcome.status === 'failed') {
        await this.writeTask(task.taskId, {
          ...task,
          status: 'failed',
          updatedAt: completedAt,
          errorDetail: outcome.errorDetail
        });
        return;
      }

      await this.writeTask(task.taskId, {
        ...task,
        status: 'completed',
        updatedAt: completedAt,
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
    } catch (error) {
      const failedAt = new Date().toISOString();

      await this.writeTask(task.taskId, {
        ...task,
        status: 'error',
        updatedAt: failedAt,
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
