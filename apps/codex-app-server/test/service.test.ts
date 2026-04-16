import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createPromptOrchestrator,
  createPromptTaskProcessorFromMappings,
  type CodexPromptGateway
} from '../src/service.js';
import type { RepoMapping, RepoSelection } from '../src/infer.js';

void test('createPromptOrchestrator resolves a repo and forwards the request to the Codex gateway', async () => {
  const gatewayCalls: Array<Record<string, unknown>> = [];
  const repo: RepoSelection = {
    id: 'supercom-backend',
    cwd: '/Users/demo/code/supercom/backend',
    reason: 'alias_match'
  };

  const gateway: CodexPromptGateway = {
    async runPrompt(request) {
      gatewayCalls.push({
        promptText: request.promptText,
        repo: request.repo,
        screenMedia: request.screenMedia
      });
      return {
        answer: 'Implemented the requested change and opened a PR.',
        branchName: 'codex/fix-spacing',
        commitSha: 'abc123',
        prUrl: 'https://github.com/iofold/open-bubble/pull/999',
        threadId: 'thr_999',
        turnId: 'turn_999'
      };
    }
  };

  const orchestrator = createPromptOrchestrator({
    inferRepo: () => repo,
    gateway
  });

  const result = await orchestrator.executePrompt({
    promptText: 'Tighten the spacing on this screen.',
    screenMedia: {
      filename: 'screen.png',
      mimeType: 'image/png',
      kind: 'image',
      path: '/tmp/screen.png'
    }
  });

  assert.equal(gatewayCalls.length, 1);
  assert.deepEqual(gatewayCalls[0], {
    promptText: 'Tighten the spacing on this screen.',
    repo,
    screenMedia: {
      filename: 'screen.png',
      mimeType: 'image/png',
      kind: 'image',
      path: '/tmp/screen.png'
    }
  });

  assert.deepEqual(result, {
    answer: 'Implemented the requested change and opened a PR.',
    branchName: 'codex/fix-spacing',
    commitSha: 'abc123',
    prUrl: 'https://github.com/iofold/open-bubble/pull/999',
    repoId: 'supercom-backend',
    threadId: 'thr_999',
    turnId: 'turn_999'
  });
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
