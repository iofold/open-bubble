import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildApp, serviceVersion } from '../src/app.js';
import type {
  PromptExecutionRequest,
  PromptExecutionResult,
  PromptExecutor
} from '../src/routes/prompt.js';
import { createMultipartPayload } from './helpers/multipart.js';

const createPromptExecutor = (
  impl: (request: PromptExecutionRequest) => Promise<PromptExecutionResult>
): PromptExecutor => ({
  executePrompt: impl
});

void test('GET /health returns ok service metadata', async () => {
  const app = await buildApp();

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

void test('POST /prompt accepts screenshot with prompt text and returns Codex result', async () => {
  const calls: PromptExecutionRequest[] = [];
  const app = await buildApp({
    promptExecutor: createPromptExecutor(async (request) => {
      calls.push(request);
      return {
        answer: 'Updated the spacing and opened a PR.',
        branchName: 'codex/fix-spacing',
        prUrl: 'https://github.com/iofold/open-bubble/pull/123',
        repoId: 'supercom-backend',
        threadId: 'thr_123'
      };
    })
  });

  try {
    const payload = createMultipartPayload(
      [
        {
          fieldName: 'screenMedia',
          filename: 'screen.png',
          contentType: 'image/png',
          content: Buffer.from('fake-png')
        }
      ],
      [
        {
          fieldName: 'promptText',
          value: 'Tighten the spacing on this screen.'
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

    assert.equal(response.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.promptText, 'Tighten the spacing on this screen.');
    assert.equal(calls[0]?.screenMedia.filename, 'screen.png');
    assert.equal(calls[0]?.screenMedia.kind, 'image');

    assert.deepEqual(response.json(), {
      answer: 'Updated the spacing and opened a PR.',
      branchName: 'codex/fix-spacing',
      prUrl: 'https://github.com/iofold/open-bubble/pull/123',
      promptText: 'Tighten the spacing on this screen.',
      repoId: 'supercom-backend',
      screenMedia: {
        filename: 'screen.png',
        mimeType: 'image/png',
        kind: 'image'
      },
      threadId: 'thr_123',
      receivedAt: response.json().receivedAt
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt rejects missing promptText', async () => {
  const app = await buildApp();

  try {
    const payload = createMultipartPayload(
      [
        {
          fieldName: 'screenMedia',
          filename: 'screen.png',
          contentType: 'image/png',
          content: Buffer.from('fake-png')
        }
      ],
      []
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
      message: 'promptText is required.'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt rejects unsupported screenMedia type', async () => {
  const app = await buildApp();

  try {
    const payload = createMultipartPayload(
      [
        {
          fieldName: 'screenMedia',
          filename: 'screen.mp4',
          contentType: 'video/mp4',
          content: Buffer.from('fake-video')
        }
      ],
      [
        {
          fieldName: 'promptText',
          value: 'Fix this.'
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

    assert.equal(response.statusCode, 415);
    assert.deepEqual(response.json(), {
      error: 'unsupported_media_type',
      message: 'screenMedia must use an image/* MIME type.'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt returns 502 when the Codex bridge fails', async () => {
  const app = await buildApp({
    promptExecutor: createPromptExecutor(async () => {
      throw new Error('failed to connect to codex app-server');
    })
  });

  try {
    const payload = createMultipartPayload(
      [
        {
          fieldName: 'screenMedia',
          filename: 'screen.png',
          contentType: 'image/png',
          content: Buffer.from('fake-png')
        }
      ],
      [
        {
          fieldName: 'promptText',
          value: 'Fix this.'
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

    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), {
      error: 'bad_gateway',
      message: 'failed to connect to codex app-server'
    });
  } finally {
    await app.close();
  }
});

void test('GET /openapi.json returns the current OpenAPI document', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json'
    });

    assert.equal(response.statusCode, 200);
    const json = response.json() as Record<string, unknown>;
    assert.equal(json['openapi'], '3.1.0');
    assert.equal(
      (json['info'] as Record<string, unknown>)['title'],
      'Open Bubble API'
    );
  } finally {
    await app.close();
  }
});
