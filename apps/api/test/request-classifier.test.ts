import * as assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
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
  contextSources: overrides.contextSources ?? ['screen', 'prompt_text', 'local_repo'],
  suggestedSkills: overrides.suggestedSkills ?? [],
  targetRepoId: overrides.targetRepoId ?? 'codex-bubble',
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

void test('classifier processor returns a coding classification, normalizes apps, and persists fallback cwd', async () => {
  const taskDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-classifier-'));

  try {
    const processor = createClassifierPromptTaskProcessor({
      client: createFakeClient({
        output_text: JSON.stringify({
          requestType: 'coding_request',
          relevantApps: ['Codex', 'Slack', 'Bogus'],
          rationale: 'The prompt asks for software debugging help.',
          handoffPlan: buildHandoffPlan()
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
    assert.equal(
      outcome.result.routingPayload.defaultCodingCwd,
      path.join(repoRoot, 'tmp')
    );
    assert.deepEqual(outcome.result.routingPayload.handoffPlan, buildHandoffPlan());

    await stat(path.join(repoRoot, 'tmp'));

    const persisted = JSON.parse(
      await readFile(path.join(taskDir, 'routing-payload.json'), 'utf8')
    ) as {
      defaultCodingCwd?: string;
      classification?: unknown;
      handoffPlan?: unknown;
    };

    assert.equal(persisted.defaultCodingCwd, path.join(repoRoot, 'tmp'));
    assert.deepEqual(persisted.classification, outcome.result.classification);
    assert.deepEqual(
      persisted.handoffPlan,
      outcome.result.routingPayload.handoffPlan
    );
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
});

void test('classifier processor returns a personal-context classification without coding fallback cwd', async () => {
  const taskDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-classifier-'));

  try {
    const processor = createClassifierPromptTaskProcessor({
      client: createFakeClient({
        output_text: JSON.stringify({
          requestType: 'personal_context_request',
          relevantApps: ['Gmail'],
          rationale: 'The prompt asks about personal inbox context.',
          handoffPlan: buildHandoffPlan({
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
          })
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
    assert.equal(
      outcome.result.routingPayload.handoffPlan.executionMode,
      'context_graph_answer'
    );
    assert.equal(outcome.result.routingPayload.defaultCodingCwd, undefined);
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
});

void test('classifier processor rejects malformed model output', async () => {
  const taskDir = await mkdtemp(path.join(os.tmpdir(), 'open-bubble-classifier-'));

  try {
    const processor = createClassifierPromptTaskProcessor({
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
