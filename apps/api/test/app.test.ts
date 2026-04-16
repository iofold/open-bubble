import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildApp, serviceVersion } from '../src/app.js';
import { createMultipartPayload } from './helpers/multipart.js';

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

void test('POST /prompt accepts screen media with prompt text', async () => {
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
      [
        {
          fieldName: 'promptText',
          value: 'What is on this screen?'
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
    assert.match(
      response.json().answer as string,
      /text prompt input/
    );
    assert.equal(response.json().screenMedia.kind, 'image');
    assert.equal(response.json().promptText, 'What is on this screen?');
    assert.equal(response.json().promptAudio, undefined);
  } finally {
    await app.close();
  }
});

void test('POST /prompt accepts screen media with prompt audio', async () => {
  const app = await buildApp();

  try {
    const payload = createMultipartPayload(
      [
        {
          fieldName: 'screenMedia',
          filename: 'recording.mp4',
          contentType: 'video/mp4',
          content: Buffer.from('fake-video')
        },
        {
          fieldName: 'promptAudio',
          filename: 'prompt.m4a',
          contentType: 'audio/mp4',
          content: Buffer.from('fake-audio')
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

    assert.equal(response.statusCode, 200);
    assert.match(
      response.json().answer as string,
      /raw audio prompt input/
    );
    assert.equal(response.json().screenMedia.kind, 'video');
    assert.deepEqual(response.json().promptAudio, {
      filename: 'prompt.m4a',
      mimeType: 'audio/mp4'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt accepts screen media with both prompt text and prompt audio', async () => {
  const app = await buildApp();

  try {
    const payload = createMultipartPayload(
      [
        {
          fieldName: 'screenMedia',
          filename: 'screen.png',
          contentType: 'image/png',
          content: Buffer.from('fake-png')
        },
        {
          fieldName: 'promptAudio',
          filename: 'prompt.wav',
          contentType: 'audio/wav',
          content: Buffer.from('fake-audio')
        }
      ],
      [
        {
          fieldName: 'promptText',
          value: 'Tell me what to do next'
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
    assert.match(
      response.json().answer as string,
      /text and raw audio prompt input/
    );
    assert.equal(response.json().promptText, 'Tell me what to do next');
    assert.deepEqual(response.json().promptAudio, {
      filename: 'prompt.wav',
      mimeType: 'audio/wav'
    });
  } finally {
    await app.close();
  }
});

void test('POST /prompt rejects missing screenMedia', async () => {
  const app = await buildApp();

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
      message: 'At least one of promptText or promptAudio is required.'
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
          filename: 'screen.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('fake-pdf')
        }
      ],
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
  const app = await buildApp();

  try {
    const payload = createMultipartPayload(
      [
        {
          fieldName: 'screenMedia',
          filename: 'screen.png',
          contentType: 'image/png',
          content: Buffer.from('fake-png')
        },
        {
          fieldName: 'promptAudio',
          filename: 'prompt.txt',
          contentType: 'text/plain',
          content: Buffer.from('not-audio')
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
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json'
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().openapi, '3.1.0');
    assert.equal(response.json().paths['/prompt'].post.summary, 'Submit a media prompt and receive a synchronous answer');
  } finally {
    await app.close();
  }
});
