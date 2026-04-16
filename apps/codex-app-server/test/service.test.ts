import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createPromptOrchestrator,
  createPromptExecutorFromMappings,
  createPromptTaskProcessorFromMappings,
  type CodexPromptGateway
} from '../src/service.js';
import type { RepoMapping, RepoSelection } from '../src/infer.js';

void test('createPromptOrchestrator resolves an assistant repo and forwards the request to the Codex gateway', async () => {
  const repoDir = await mkdtemp(join(tmpdir(), 'codex-app-server-assistant-'));
  const gatewayCalls: Array<Record<string, unknown>> = [];

  try {
    const repo: RepoSelection = {
      id: 'codex-agent',
      cwd: repoDir,
      reason: 'explicit_repo'
    };

    const gateway: CodexPromptGateway = {
      async runPrompt(request) {
        gatewayCalls.push({
          promptText: request.promptText,
          repo: request.repo,
          mode: request.mode,
          screenMedia: request.screenMedia
        });
        return {
          answer: 'Checked the linked context and summarized the result.',
          threadId: 'thr_999',
          turnId: 'turn_999'
        };
      }
    };

    const orchestrator = createPromptOrchestrator({
      selectRepo: () => repo,
      gateway
    });

    const result = await orchestrator.executePrompt({
      promptText: 'What is my latest insurance email?',
      route: {
        mode: 'assistant',
        requestType: 'personal_context_request',
        relevantApps: ['Gmail']
      },
      screenMedia: {
        filename: 'screen.png',
        mimeType: 'image/png',
        kind: 'image',
        path: '/tmp/screen.png'
      }
    });

    assert.equal(gatewayCalls.length, 1);
    assert.deepEqual(gatewayCalls[0], {
      promptText: 'What is my latest insurance email?',
      repo,
      mode: 'assistant',
      screenMedia: {
        filename: 'screen.png',
        mimeType: 'image/png',
        kind: 'image',
        path: '/tmp/screen.png'
      }
    });

    assert.deepEqual(result, {
      answer: 'Checked the linked context and summarized the result.',
      repoId: 'codex-agent',
      threadId: 'thr_999',
      turnId: 'turn_999'
    });
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
});

void test('createPromptExecutorFromMappings honors an explicit repo route and assistant mode', async () => {
  const assistantRepoDir = await mkdtemp(join(tmpdir(), 'codex-app-server-assistant-'));
  const gatewayCalls: Array<Record<string, unknown>> = [];

  try {
    const mappings: RepoMapping[] = [
      {
        id: 'codex-agent',
        cwd: assistantRepoDir,
        aliases: ['codex agent'],
        description: 'Context workspace'
      },
      {
        id: 'supercom-backend',
        cwd: '/Users/demo/code/supercom/backend',
        aliases: ['supercom']
      }
    ];

    const gateway: CodexPromptGateway = {
      async runPrompt(request) {
        gatewayCalls.push({
          promptText: request.promptText,
          repo: request.repo,
          mode: request.mode,
          requestType: request.requestType,
          relevantApps: request.relevantApps
        });
        return {
          answer: 'Checked Gmail and summarized the user context.',
          threadId: 'thr_ctx',
          turnId: 'turn_ctx'
        };
      }
    };

    const executor = createPromptExecutorFromMappings(mappings, gateway);
    const result = await executor.executePrompt({
      promptText: 'What is my latest insurance email?',
      route: {
        repoId: 'codex-agent',
        mode: 'assistant',
        requestType: 'personal_context_request',
        relevantApps: ['Gmail']
      },
      screenMedia: {
        filename: 'screen.png',
        mimeType: 'image/png',
        kind: 'image',
        path: '/tmp/screen.png'
      }
    });

    assert.deepEqual(gatewayCalls[0], {
      promptText: 'What is my latest insurance email?',
      repo: {
        id: 'codex-agent',
        cwd: assistantRepoDir,
        description: 'Context workspace',
        reason: 'explicit_repo'
      },
      mode: 'assistant',
      requestType: 'personal_context_request',
      relevantApps: ['Gmail']
    });
    assert.deepEqual(result, {
      answer: 'Checked Gmail and summarized the user context.',
      repoId: 'codex-agent',
      threadId: 'thr_ctx',
      turnId: 'turn_ctx'
    });
  } finally {
    await rm(assistantRepoDir, { recursive: true, force: true });
  }
});

void test('createPromptTaskProcessorFromMappings rejects non-image screen media before invoking Codex', async () => {
  const mappings: RepoMapping[] = [
    {
      id: 'supercom-backend',
      cwd: '/Users/demo/code/supercom/backend',
      aliases: ['supercom'],
      isDefault: true
    }
  ];

  const processor = createPromptTaskProcessorFromMappings(
    mappings,
    {
      async runPrompt() {
        throw new Error('runPrompt should not be called for video input');
      }
    },
    console
  );

  const outcome = await processor({
    taskId: 'task_123',
    taskDir: '/tmp/task_123',
    screenMedia: {
      filename: 'screen.mp4',
      mimeType: 'video/mp4',
      kind: 'video'
    },
    screenMediaPath: '/tmp/task_123/screen.mp4',
    promptText: 'Open a PR for this',
    updateTask: async () => {}
  });

  assert.deepEqual(outcome, {
    status: 'failed',
    errorDetail: {
      code: 'screen_media_unsupported',
      message: 'Only image screenMedia is supported in this Codex workflow right now.'
    }
  });
});
