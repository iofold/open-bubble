import * as assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { RepoMapping } from '@open-bubble/codex-app-server';
import { createClassifierPromptTaskProcessor } from '../src/lib/request-classifier.js';
import type {
  PromptHandoffPlan,
  PromptTaskProcessorInput
} from '../src/lib/task-manager.js';

interface FakeClientResponse {
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
  output_text?: string;
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const repoMappings: RepoMapping[] = [
  {
    id: 'codex-bubble',
    cwd: repoRoot,
    aliases: ['codex bubble'],
    description: 'Open Bubble workspace'
  },
  {
    id: 'codex-agent',
    cwd: path.join(repoRoot, 'apps', 'codex-agent'),
    aliases: ['codex agent'],
    description: 'Assistant workspace'
  },
  {
    id: 'tmp',
    cwd: path.join(repoRoot, 'tmp'),
    aliases: ['tmp'],
    description: 'Scratch workspace'
  }
];

const createFakeClient = (response: FakeClientResponse) => ({
  async createResponse() {
    return response;
  }
});

const buildHandoffPlan = (
  overrides: Partial<PromptHandoffPlan> = {}
): PromptHandoffPlan => ({
  executionMode: overrides.executionMode ?? 'autonomous_code_change',
  finalResponseStyle: overrides.finalResponseStyle ?? 'pull_request_only',
  inferredIntent:
    overrides.inferredIntent ??
    'Fix a software issue visible on the current screen.',
  inferredDeliverable:
    overrides.inferredDeliverable ??
    'A pull request that resolves the on-screen bug.',
  screenshotSummary:
    overrides.screenshotSummary ??
    'An app screen appears to show a software issue.',
  contextSources:
    overrides.contextSources ?? ['screen', 'prompt_text', 'local_repo'],
  suggestedSkills: overrides.suggestedSkills ?? [],
  targetRepoId: overrides.targetRepoId ?? null,
  expandedPrompt:
    overrides.expandedPrompt ??
    'Work autonomously in the correct repo, fix the issue, validate the touched area, and return only the PR URL.'
});

const createInput = async (
  taskDir: string,
  overrides: Partial<PromptTaskProcessorInput> = {}
): Promise<PromptTaskProcessorInput> => ({
  taskId: 'task_123',
  taskDir,
  screenMedia: {
    filename: 'screen.png',
    mimeType: 'image/png',
    kind: 'image'
  },
  screenMediaBuffer: Buffer.from('fake-screen'),
  screenMediaPath: path.join(taskDir, 'screen-media.bin'),
  promptText: 'My app is broken',
  updateTask: async () => {},
  ...overrides
});

void test('classifier processor persists the richer handoff plan and tmp fallback execution target for unmapped coding requests', async () => {
  const taskDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-classifier-'));

  try {
    const processor = createClassifierPromptTaskProcessor({
      repoMappings,
      client: createFakeClient({
        output_text: JSON.stringify({
          requestType: 'coding_request',
          relevantApps: ['Codex', 'Slack', 'Bogus'],
          rationale: 'The prompt asks for software debugging help.',
          handoffPlan: buildHandoffPlan({
            targetRepoId: null
          })
        })
      })
    });

    const outcome = await processor(await createInput(taskDir));

    assert.equal(outcome.status, 'completed');

    if (outcome.status !== 'completed') {
      assert.fail('Expected a completed outcome.');
    }

    assert.deepEqual(outcome.result.classification, {
      requestType: 'coding_request',
      relevantApps: ['Codex', 'Slack'],
      rationale: 'The prompt asks for software debugging help.'
    });
    assert.deepEqual(outcome.result.routingPayload.executionTarget, {
      repoId: 'tmp',
      cwd: path.join(repoRoot, 'tmp'),
      mode: 'coding',
      source: 'coding_fallback'
    });
    assert.deepEqual(
      outcome.result.routingPayload.handoffPlan,
      buildHandoffPlan({
        targetRepoId: null
      })
    );

    await stat(path.join(repoRoot, 'tmp'));

    const persisted = JSON.parse(
      await readFile(path.join(taskDir, 'routing-payload.json'), 'utf8')
    ) as {
      executionTarget?: {
        repoId?: string;
        cwd?: string;
      };
      classification?: unknown;
      handoffPlan?: unknown;
    };

    assert.equal(persisted.executionTarget?.repoId, 'tmp');
    assert.equal(persisted.executionTarget?.cwd, path.join(repoRoot, 'tmp'));
    assert.deepEqual(persisted.classification, outcome.result.classification);
    assert.deepEqual(
      persisted.handoffPlan,
      outcome.result.routingPayload.handoffPlan
    );
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
});

void test('classifier processor routes personal-context requests to codex-agent while preserving the handoff plan', async () => {
  const taskDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-classifier-'));
  const handoffPlan = buildHandoffPlan({
    executionMode: 'context_graph_answer',
    finalResponseStyle: 'succinct_answer',
    inferredIntent:
      'Find and answer the insurance question from personal context.',
    inferredDeliverable:
      'A short direct answer pulled from screenshot and inbox context.',
    screenshotSummary:
      'The user appears to be looking at an insurance-related message.',
    contextSources: ['screen', 'prompt_text', 'gmail', 'context_graph'],
    suggestedSkills: [
      'open-bubble-context-answer',
      'open-bubble-mcp-connectors'
    ],
    targetRepoId: null,
    expandedPrompt:
      'Use the screenshot plus Gmail-backed context graph data to answer the insurance question succinctly.'
  });

  try {
    const processor = createClassifierPromptTaskProcessor({
      repoMappings,
      client: createFakeClient({
        output_text: JSON.stringify({
          requestType: 'personal_context_request',
          relevantApps: ['Gmail'],
          rationale: 'The prompt asks about personal inbox context.',
          handoffPlan
        })
      })
    });

    const outcome = await processor(
      await createInput(taskDir, {
        promptText: 'What is my latest insurance email?'
      })
    );

    assert.equal(outcome.status, 'completed');

    if (outcome.status !== 'completed') {
      assert.fail('Expected a completed outcome.');
    }

    assert.deepEqual(outcome.result.classification, {
      requestType: 'personal_context_request',
      relevantApps: ['Gmail'],
      rationale: 'The prompt asks about personal inbox context.'
    });
    assert.deepEqual(outcome.result.routingPayload.handoffPlan, handoffPlan);
    assert.deepEqual(outcome.result.routingPayload.executionTarget, {
      repoId: 'codex-agent',
      cwd: path.join(repoRoot, 'apps', 'codex-agent'),
      mode: 'assistant',
      source: 'personal_context'
    });
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
});

void test('classifier processor forwards the enriched handoff prompt into the executor and returns execution output', async () => {
  const taskDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-classifier-'));
  const executorCalls: Array<Record<string, unknown>> = [];
  const handoffPlan = buildHandoffPlan({
    targetRepoId: 'codex-bubble',
    expandedPrompt:
      'Work autonomously in the Open Bubble repo, fix the API handoff issue, validate the touched area, and return only the PR URL.'
  });

  try {
    const processor = createClassifierPromptTaskProcessor({
      repoMappings,
      client: createFakeClient({
        output_text: JSON.stringify({
          requestType: 'coding_request',
          relevantApps: ['Codex'],
          rationale: 'The prompt is clearly about fixing the Open Bubble API.',
          handoffPlan
        })
      }),
      executor: {
        async executePrompt(request) {
          executorCalls.push({
            promptText: request.promptText,
            route: request.route,
            screenMedia: request.screenMedia
          });
          return {
            answer: 'Opened a PR for the requested fix.',
            prUrl: 'https://github.com/iofold/open-bubble/pull/999',
            branchName: 'codex/fix-api-routing',
            commitSha: 'abc123',
            repoId: 'codex-bubble',
            threadId: 'thr_123',
            turnId: 'turn_123'
          };
        }
      }
    });

    const outcome = await processor(
      await createInput(taskDir, {
        promptText: 'Fix the API handoff in Open Bubble.'
      })
    );

    assert.equal(outcome.status, 'completed');

    if (outcome.status !== 'completed') {
      assert.fail('Expected a completed outcome.');
    }

    assert.equal(executorCalls[0]?.['promptText'], handoffPlan.expandedPrompt);
    assert.deepEqual(executorCalls[0]?.['route'], {
      repoId: 'codex-bubble',
      mode: 'coding',
      requestType: 'coding_request',
      relevantApps: ['Codex'],
      rationale: 'The prompt is clearly about fixing the Open Bubble API.'
    });
    assert.deepEqual(outcome.result, {
      answer: 'Opened a PR for the requested fix.',
      pullRequestUrl: 'https://github.com/iofold/open-bubble/pull/999',
      branchName: 'codex/fix-api-routing',
      commitSha: 'abc123',
      repoId: 'codex-bubble',
      threadId: 'thr_123',
      turnId: 'turn_123',
      classification: {
        requestType: 'coding_request',
        relevantApps: ['Codex'],
        rationale: 'The prompt is clearly about fixing the Open Bubble API.',
        repoId: 'codex-bubble'
      },
      routingPayload: {
        promptText: 'Fix the API handoff in Open Bubble.',
        screenMedia: {
          filename: 'screen.png',
          mimeType: 'image/png',
          kind: 'image'
        },
        screenMediaPath: path.join(taskDir, 'screen-media.bin'),
        classification: {
          requestType: 'coding_request',
          relevantApps: ['Codex'],
          rationale: 'The prompt is clearly about fixing the Open Bubble API.',
          repoId: 'codex-bubble'
        },
        handoffPlan,
        executionTarget: {
          repoId: 'codex-bubble',
          cwd: repoRoot,
          mode: 'coding',
          source: 'classifier_repo'
        }
      }
    });
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
});

void test('classifier processor rejects malformed model output', async () => {
  const taskDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-classifier-'));

  try {
    const processor = createClassifierPromptTaskProcessor({
      repoMappings,
      client: createFakeClient({
        output_text: JSON.stringify({
          requestType: 'not_a_real_type',
          relevantApps: ['Codex'],
          rationale: 'bad',
          handoffPlan: buildHandoffPlan()
        })
      })
    });

    await assert.rejects(
      processor(await createInput(taskDir)),
      /invalid requestType/
    );
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
});
