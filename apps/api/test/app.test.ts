import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp, serviceVersion } from '../src/app.js';
import type { PromptTaskProcessor } from '../src/lib/task-manager.js';
import { createMultipartPayload } from './helpers/multipart.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const fixturePath = (...segments: string[]): string =>
  path.join(repoRoot, 'apps', 'codex-agent', 'testdata', ...segments);

const readFixture = async (name: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(fixturePath(name), 'utf8')) as Record<string, unknown>;

const createTaskStoreRoot = async (): Promise<string> =>
  mkdtemp(path.join(os.tmpdir(), 'open-bubble-api-task-test-'));

const createDummyTaskProcessor = (): PromptTaskProcessor =>
  async ({ screenMedia, promptText, promptAudio, updateTask }) => {
    await updateTask({
      repoId: 'demo-repo',
      threadId: 'demo-thread',
      turnId: 'demo-turn'
    });

    const screenLabel =
      screenMedia.kind === 'image' ? 'screenshot' : 'screen recording';
    const answer =
      promptText && promptAudio
        ? `Dummy response for ${screenLabel} with text and raw audio prompt input.`
        : promptAudio
          ? `Dummy response for ${screenLabel} with raw audio prompt input.`
          : `Dummy response for ${screenLabel} with text prompt input.`;

    return {
      status: 'completed',
      result: {
        answer,
        repoId: 'demo-repo',
        threadId: 'demo-thread',
        turnId: 'demo-turn'
      }
    };
  };

const createTestApp = async (
  options: Parameters<typeof buildApp>[0] = {}
): Promise<FastifyInstance> =>
  buildApp({
    taskStoreRoot: await createTaskStoreRoot(),
    taskProcessor: options.taskProcessor ?? createDummyTaskProcessor(),
    ...options
  });

const createPromptPayload = (
  options: {
    includePromptText?: boolean;
    includePromptAudio?: boolean;
    screenMediaType?: string;
    screenMediaFilename?: string;
    promptAudioType?: string;
    promptAudioFilename?: string;
  } = {}
) => {
  const {
    includePromptText = true,
    includePromptAudio = false,
    screenMediaType = 'image/png',
    screenMediaFilename = 'screen.png',
    promptAudioType = 'audio/mp4',
    promptAudioFilename = 'prompt.m4a'
  } = options;

  const fileFields = [
    {
      fieldName: 'screenMedia',
      filename: screenMediaFilename,
      contentType: screenMediaType,
      content: Buffer.from('fake-screen-media')
    }
  ];

  if (includePromptAudio) {
    fileFields.push({
      fieldName: 'promptAudio',
      filename: promptAudioFilename,
      contentType: promptAudioType,
      content: Buffer.from('fake-audio')
    });
  }

  const textFields = includePromptText
    ? [
        {
          fieldName: 'promptText',
          value: 'What should I do next?'
        }
      ]
    : [];

  return createMultipartPayload(fileFields, textFields);
};

const submitPrompt = async (
  app: FastifyInstance,
  payload = createPromptPayload()
) =>
  app.inject({
    method: 'POST',
    url: '/prompt',
    payload: payload.body,
    headers: {
      'content-type': payload.contentType
    }
  });

const waitForTaskStatus = async (
  app: FastifyInstance,
  taskId: string,
  expectedStatus: 'completed' | 'failed' | 'error',
  attempts = 40
) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await app.inject({
      method: 'GET',
      url: `/tasks/${taskId}`
    });

    assert.equal(response.statusCode, 200);

    const payload = response.json();

    if (payload.status === expectedStatus) {
      return payload;
    }

    await delay(10);
  }

  assert.fail(`Task ${taskId} did not reach ${expectedStatus}.`);
};

const withContextGraphDb = async <T>(fn: () => Promise<T>): Promise<T> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-api-'));
  const previous = process.env['OPEN_BUBBLE_CONTEXT_DB'];
  process.env['OPEN_BUBBLE_CONTEXT_DB'] = path.join(tempDir, 'context.duckdb');

  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env['OPEN_BUBBLE_CONTEXT_DB'];
    } else {
      process.env['OPEN_BUBBLE_CONTEXT_DB'] = previous;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
};

void test('GET /health returns ok service metadata', async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      ok: true,
      service: 'open-bubble-api',
      version: serviceVersion
    });
  } finally {
    await app.close();
  }
});

void test('GET /apps returns the supported app list', async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/apps'
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      apps: ['Codex', 'Gmail', 'Gcal', 'Slack', 'Notion']
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt returns 202 with a task handle', async () => {
  const app = await createTestApp({
    taskProcessor: async ({ screenMedia }) => {
      await delay(25);
      return {
        status: 'completed',
        result: {
          answer: `Processed ${screenMedia.kind}.`
        }
      };
    }
  });

  try {
    const response = await submitPrompt(app);
    const payload = response.json();

    assert.equal(response.statusCode, 202);
    assert.match(payload.taskId as string, /^[0-9a-f-]{36}$/i);
    assert.equal(payload.status, 'in_progress');
    assert.equal(payload.statusUrl, `/tasks/${payload.taskId as string}`);
    assert.match(payload.createdAt as string, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await app.close();
  }
});

void test('GET /tasks/:taskId returns in_progress before background work finishes', async () => {
  const app = await createTestApp({
    taskProcessor: async ({ screenMedia, updateTask }) => {
      await updateTask({
        repoId: 'supercom-backend',
        threadId: 'thr_in_progress',
        turnId: 'turn_in_progress'
      });

      await delay(50);
      return {
        status: 'completed',
        result: {
          answer: `Processed ${screenMedia.kind}.`,
          repoId: 'supercom-backend',
          threadId: 'thr_in_progress',
          turnId: 'turn_in_progress'
        }
      };
    }
  });

  try {
    const submitResponse = await submitPrompt(app);
    const { taskId } = submitResponse.json();

    let statusResponse = await app.inject({
      method: 'GET',
      url: `/tasks/${taskId as string}`
    });

    if (statusResponse.json().repoId === undefined) {
      await delay(25);
      statusResponse = await app.inject({
        method: 'GET',
        url: `/tasks/${taskId as string}`
      });
    }

    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.json().status, 'in_progress');
    assert.equal(statusResponse.json().repoId, 'supercom-backend');
    assert.equal(statusResponse.json().threadId, 'thr_in_progress');
    assert.equal(statusResponse.json().turnId, 'turn_in_progress');

    const completedTask = await waitForTaskStatus(
      app,
      taskId as string,
      'completed'
    );

    assert.match(completedTask.result.answer as string, /Processed image/);
    assert.equal(completedTask.result.repoId, 'supercom-backend');
    assert.equal(completedTask.result.threadId, 'thr_in_progress');
    assert.equal(completedTask.result.turnId, 'turn_in_progress');
  } finally {
    await app.close();
  }
});

void test('GET /tasks/:taskId returns completed prompt results for text and audio inputs', async () => {
  const app = await createTestApp();

  try {
    const payload = createPromptPayload({
      includePromptText: true,
      includePromptAudio: true,
      screenMediaType: 'video/mp4',
      screenMediaFilename: 'recording.mp4',
      promptAudioType: 'audio/wav',
      promptAudioFilename: 'prompt.wav'
    });

    const submitResponse = await submitPrompt(app, payload);
    const { taskId } = submitResponse.json();
    const completedTask = await waitForTaskStatus(
      app,
      taskId as string,
      'completed'
    );

    assert.equal(completedTask.status, 'completed');
    assert.match(
      completedTask.result.answer as string,
      /text and raw audio prompt input/
    );
    assert.equal(completedTask.repoId, 'demo-repo');
    assert.equal(completedTask.threadId, 'demo-thread');
    assert.equal(completedTask.turnId, 'demo-turn');
    assert.equal(completedTask.result.promptText, 'What should I do next?');
    assert.deepEqual(completedTask.result.promptAudio, {
      filename: 'prompt.wav',
      mimeType: 'audio/wav'
    });
    assert.deepEqual(completedTask.result.screenMedia, {
      filename: 'recording.mp4',
      mimeType: 'video/mp4',
      kind: 'video'
    });
    assert.match(completedTask.result.completedAt as string, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(completedTask.result.repoId, 'demo-repo');
    assert.equal(completedTask.result.threadId, 'demo-thread');
    assert.equal(completedTask.result.turnId, 'demo-turn');
  } finally {
    await app.close();
  }
});

void test('GET /tasks/:taskId surfaces failed task state', async () => {
  const app = await createTestApp({
    taskProcessor: async () => ({
      status: 'failed',
      errorDetail: {
        code: 'task_failed',
        message: 'The coding task could not produce a pull request.'
      }
    })
  });

  try {
    const submitResponse = await submitPrompt(app);
    const { taskId } = submitResponse.json();
    const failedTask = await waitForTaskStatus(
      app,
      taskId as string,
      'failed'
    );

    assert.deepEqual(failedTask.errorDetail, {
      code: 'task_failed',
      message: 'The coding task could not produce a pull request.'
    });
    assert.equal(failedTask.result, undefined);
  } finally {
    await app.close();
  }
});

void test('GET /tasks/:taskId surfaces error task state when processing throws', async () => {
  const app = await createTestApp({
    taskProcessor: async () => {
      throw new Error('Background worker crashed');
    }
  });

  try {
    const submitResponse = await submitPrompt(app);
    const { taskId } = submitResponse.json();
    const errorTask = await waitForTaskStatus(
      app,
      taskId as string,
      'error'
    );

    assert.deepEqual(errorTask.errorDetail, {
      code: 'task_error',
      message: 'Background worker crashed'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt handles multiple background tasks in parallel', async () => {
  let activeTasks = 0;
  let maxParallelTasks = 0;

  const app = await createTestApp({
    taskProcessor: async ({ promptText }) => {
      activeTasks += 1;
      maxParallelTasks = Math.max(maxParallelTasks, activeTasks);

      await delay(30);

      activeTasks -= 1;

      return {
        status: 'completed',
        result: {
          answer: `Finished ${promptText ?? 'task'}.`
        }
      };
    }
  });

  try {
    const [firstResponse, secondResponse] = await Promise.all([
      submitPrompt(app),
      submitPrompt(app)
    ]);

    const firstTaskId = firstResponse.json().taskId as string;
    const secondTaskId = secondResponse.json().taskId as string;

    assert.notEqual(firstTaskId, secondTaskId);

    await Promise.all([
      waitForTaskStatus(app, firstTaskId, 'completed'),
      waitForTaskStatus(app, secondTaskId, 'completed')
    ]);

    assert.equal(maxParallelTasks, 2);
  } finally {
    await app.close();
  }
});

void test('GET /tasks/:taskId returns 404 for unknown tasks', async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/tasks/7d9dbf5b-b0d1-487f-b252-0f72b275f935'
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: 'not_found',
      message: 'Task 7d9dbf5b-b0d1-487f-b252-0f72b275f935 was not found.'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt rejects missing screenMedia', async () => {
  const app = await createTestApp();

  try {
    const payload = createMultipartPayload(
      [],
      [
        {
          fieldName: 'promptText',
          value: 'Need help'
        }
      ]
    );

    const response = await app.inject({
      method: 'POST',
      url: '/prompt',
      payload: payload.body,
      headers: {
        'content-type': payload.contentType
      }
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'bad_request',
      message: 'screenMedia is required.'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt rejects missing promptText and promptAudio', async () => {
  const app = await createTestApp();

  try {
    const payload = createPromptPayload({
      includePromptText: false,
      includePromptAudio: false
    });

    const response = await submitPrompt(app, payload);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'bad_request',
      message: 'At least one of promptText or promptAudio is required.'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt rejects unsupported screenMedia type', async () => {
  const app = await createTestApp();

  try {
    const payload = createPromptPayload({
      screenMediaType: 'application/pdf',
      screenMediaFilename: 'screen.pdf'
    });

    const response = await submitPrompt(app, payload);

    assert.equal(response.statusCode, 415);
    assert.deepEqual(response.json(), {
      error: 'unsupported_media_type',
      message: 'screenMedia must use an image/* or video/* MIME type.'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt rejects unsupported promptAudio type', async () => {
  const app = await createTestApp();

  try {
    const payload = createPromptPayload({
      includePromptText: false,
      includePromptAudio: true,
      promptAudioType: 'text/plain',
      promptAudioFilename: 'prompt.txt'
    });

    const response = await submitPrompt(app, payload);

    assert.equal(response.statusCode, 415);
    assert.deepEqual(response.json(), {
      error: 'unsupported_media_type',
      message: 'promptAudio must use an audio/* MIME type.'
    });
  } finally {
    await app.close();
  }
});

void test('GET /openapi.json returns the current OpenAPI document', async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().openapi, '3.1.0');
    assert.equal(
      response.json().paths['/apps'].get.summary,
      'List supported apps'
    );
    assert.equal(
      response.json().paths['/prompt'].post.summary,
      'Submit a media prompt and create an async task'
    );
    assert.equal(
      response.json().paths['/tasks/{taskId}'].get.summary,
      'Get prompt task status'
    );
  } finally {
    await app.close();
  }
});

void test('context graph endpoints seed, ingest MCP, and export live graph', async () => {
  await withContextGraphDb(async () => {
    const app = await createTestApp();

    try {
      const seedResponse = await app.inject({
        method: 'POST',
        url: '/context-graph/seed',
        payload: {
          fixture: await readFixture('seed-context.json'),
          reset: true
        }
      });

      assert.equal(seedResponse.statusCode, 200);
      assert.equal(seedResponse.json().sessionId, 'sess_test_001');

      const mcpResponse = await app.inject({
        method: 'POST',
        url: '/context-graph/ingest/mcp-results',
        payload: await readFixture('mcp-gmail-results.json')
      });

      assert.equal(mcpResponse.statusCode, 200);
      assert.equal(mcpResponse.json().connector, 'gmail');

      const graphResponse = await app.inject({
        method: 'GET',
        url: '/context-graph?sessionId=sess_test_001'
      });

      assert.equal(graphResponse.statusCode, 200);
      assert.equal(graphResponse.json().sessionId, 'sess_test_001');
      assert.ok(graphResponse.json().nodes.length > 0);
      assert.ok(graphResponse.json().edges.some((edge: { sourceEpisodeId?: string }) => edge.sourceEpisodeId));
      assert.equal(graphResponse.json().stats.connectorCounts.gmail, 4);
    } finally {
      await app.close();
    }
  });
});

void test('control panel serves the live graph UI assets', async () => {
  const app = await createTestApp();

  try {
    const html = await app.inject({
      method: 'GET',
      url: '/control-panel'
    });

    assert.equal(html.statusCode, 200);
    assert.match(html.body, /Context Graph/);
    assert.match(html.headers['content-type'] as string, /text\/html/);

    const js = await app.inject({
      method: 'GET',
      url: '/control-panel/app.js'
    });

    assert.equal(js.statusCode, 200);
    assert.match(js.body, /EventSource/);
  } finally {
    await app.close();
  }
});
