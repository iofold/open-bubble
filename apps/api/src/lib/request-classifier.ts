import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import OpenAI from 'openai';
import {
  createPromptExecutorFromMappings,
  loadRepoMappings,
  resolveRepoById,
  type PromptExecutor,
  type RepoMapping
} from '@open-bubble/codex-app-server';
import { resolveFromRepoRoot } from './openapi.js';
import type {
  PromptHandoffPlan,
  PromptTaskProcessor,
  PromptTaskProcessorInput,
  RequestClassification,
  RequestType,
  RoutingExecutionTarget,
  RoutingPayload,
  TaskFailure
} from './task-manager.js';
import { supportedApps, type SupportedAppName } from './supported-apps.js';

const defaultClassifierModel = 'gpt-5.4';
const routingPayloadFileName = 'routing-payload.json';
const repoConfigPath = resolveFromRepoRoot(
  'apps',
  'codex-app-server',
  'config',
  'repos.json'
);
const assistantWorkspaceRepoId = 'codex-agent';
const codingFallbackRepoId = 'tmp';
const knownContextSkillIds = [
  'open-bubble-ingest-request',
  'open-bubble-context-answer',
  'open-bubble-context-graph',
  'open-bubble-mcp-connectors'
] as const;
const knownContextSources = [
  'screen',
  'prompt_text',
  'prompt_audio',
  'gmail',
  'drive',
  'calendar',
  'local_repo',
  'context_graph'
] as const;

type ClassificationSchemaFormat = {
  type: 'json_schema';
  name: string;
  strict: true;
  schema: Record<string, unknown>;
};

type ClassificationContent =
  | {
      type: 'input_text';
      text: string;
    }
  | {
      type: 'input_image';
      image_url: string;
      detail: 'auto';
    };

interface RepoCatalogEntry {
  id?: unknown;
  aliases?: unknown;
  description?: unknown;
}

interface RepoCatalogFile {
  repos?: RepoCatalogEntry[];
}

const classifierInstructions = [
  'You are Open Bubble, an ambient assistant running on the user screen.',
  'Your job is to inspect the user prompt, prompt-audio metadata, and the attached screenshot when present, then prepare a robust downstream handoff.',
  'Do not directly answer the user question. Do not pretend execution already happened.',
  'Infer what the user most likely wants even if the prompt is short or missing.',
  'Choose exactly one requestType:',
  '- coding_request: software debugging, implementation, review, bug fixing, repo work, or product behavior changes.',
  '- personal_context_request: answering a personal question from inbox, calendar, drive, notes, insurance, or other user context.',
  '- action_request: taking or preparing an action such as scheduling, drafting, inviting, replying, sending, or updating something for the user.',
  'Also produce one handoffPlan with a detailed downstream prompt.',
  'executionMode must match the likely downstream lane:',
  '- autonomous_code_change: a coding agent should work autonomously in the right repo, make changes, validate the touched area, and create a PR artifact.',
  '- context_graph_answer: the Codex-agent context graph lane should answer a user question from screenshot plus Gmail/Drive/Calendar/local context.',
  '- app_action: the agent should perform or prepare a user action such as calendar scheduling or message drafting.',
  'finalResponseStyle must match the downstream user-facing result:',
  '- pull_request_only: the final user-facing response should be only the PR URL.',
  '- succinct_answer: the final user-facing response should be a short direct answer.',
  '- succinct_confirmation: the final user-facing response should be a short confirmation or result.',
  `relevantApps must only use this exact list when clearly applicable: ${supportedApps.join(', ')}.`,
  `suggestedSkills must only use this exact list when clearly applicable: ${knownContextSkillIds.join(', ')}.`,
  `contextSources must only use these exact values: ${knownContextSources.join(', ')}.`,
  'If a repo is clearly referenced, set targetRepoId to the repo id from the provided catalog. Otherwise return null.',
  'expandedPrompt must be detailed and actionable. It should mention: the user request, what is visible on screen, the inferred intent, the right repo or context lane, autonomy expectations, the expected artifact, and the final response style.',
  'For coding requests, expandedPrompt must instruct the agent to work autonomously, avoid follow-up questions, create a PR when possible, and return only the PR URL to the user.',
  'For personal context requests, expandedPrompt must instruct the agent to use the screenshot plus context graph and relevant skills to answer the user question succinctly.',
  'For action requests, expandedPrompt must instruct the agent to use context graph plus relevant connectors, infer scheduling/message intent from the screenshot and prompt, and finish with a succinct confirmation.',
  'Keep rationale short and concrete, but make expandedPrompt rich and explicit.'
].join('\n');

const classificationSchema: ClassificationSchemaFormat = {
  type: 'json_schema',
  name: 'request_classification',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      requestType: {
        type: 'string',
        enum: [
          'coding_request',
          'personal_context_request',
          'action_request'
        ]
      },
      relevantApps: {
        type: 'array',
        items: {
          type: 'string',
          enum: [...supportedApps]
        }
      },
      rationale: {
        type: 'string'
      },
      handoffPlan: {
        type: 'object',
        properties: {
          executionMode: {
            type: 'string',
            enum: [
              'autonomous_code_change',
              'context_graph_answer',
              'app_action'
            ]
          },
          finalResponseStyle: {
            type: 'string',
            enum: [
              'pull_request_only',
              'succinct_answer',
              'succinct_confirmation'
            ]
          },
          inferredIntent: {
            type: 'string'
          },
          inferredDeliverable: {
            type: 'string'
          },
          screenshotSummary: {
            type: 'string'
          },
          contextSources: {
            type: 'array',
            items: {
              type: 'string',
              enum: [...knownContextSources]
            }
          },
          suggestedSkills: {
            type: 'array',
            items: {
              type: 'string',
              enum: [...knownContextSkillIds]
            }
          },
          targetRepoId: {
            type: ['string', 'null']
          },
          expandedPrompt: {
            type: 'string'
          }
        },
        required: [
          'executionMode',
          'finalResponseStyle',
          'inferredIntent',
          'inferredDeliverable',
          'screenshotSummary',
          'contextSources',
          'suggestedSkills',
          'targetRepoId',
          'expandedPrompt'
        ],
        additionalProperties: false
      }
    },
    required: ['requestType', 'relevantApps', 'rationale', 'handoffPlan'],
    additionalProperties: false
  }
};

interface ClassificationRequest {
  model: string;
  store: false;
  reasoning: {
    effort: 'none';
  };
  text: {
    verbosity: 'low';
    format: ClassificationSchemaFormat;
  };
  max_output_tokens: number;
  instructions: string;
  input: Array<{
    role: 'user';
    content: ClassificationContent[];
  }>;
}

interface ClassificationResponse {
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
  output_text?: string;
}

interface ClassificationClient {
  createResponse: (
    payload: ClassificationRequest
  ) => Promise<ClassificationResponse>;
}

interface CreateClassifierPromptTaskProcessorOptions {
  client?: ClassificationClient;
  executor?: PromptExecutor;
  repoMappings?: RepoMapping[];
}

type RawClassification = {
  requestType?: unknown;
  relevantApps?: unknown;
  rationale?: unknown;
  handoffPlan?: unknown;
};

interface ClassifiedRequest {
  classification: RequestClassification;
  handoffPlan: PromptHandoffPlan;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(
      `Missing ${key}. Add it to the repo-level .env before calling POST /prompt.`
    );
  }

  return value;
};

const getClassifierBaseUrl = (): string | undefined => {
  const value = process.env['OPEN_BUBBLE_CLASSIFIER_BASE_URL']?.trim();
  return value && value.length > 0 ? value : undefined;
};

const createOpenAiClient = (): ClassificationClient => ({
  createResponse: async (payload: ClassificationRequest) => {
    const client = new OpenAI({
      apiKey: getRequiredEnv('OPENAI_API_KEY'),
      ...(getClassifierBaseUrl() ? { baseURL: getClassifierBaseUrl() } : {})
    });
    const response = await client.responses.create(payload);

    return {
      ...(response.status ? { status: response.status } : {}),
      ...(response.incomplete_details
        ? {
            incomplete_details: {
              ...(response.incomplete_details.reason
                ? { reason: response.incomplete_details.reason }
                : {})
            }
          }
        : {}),
      ...(response.output_text ? { output_text: response.output_text } : {})
    };
  }
});

const buildLocalFallbackRepoMappings = (): RepoMapping[] => [
  {
    id: 'codex-bubble',
    cwd: resolveFromRepoRoot(),
    aliases: ['codex bubble', 'codex-bubble'],
    description:
      'Open Bubble monorepo workspace for the API, docs, mobile shell, and app-server integration work.'
  },
  {
    id: assistantWorkspaceRepoId,
    cwd: resolveFromRepoRoot('apps', 'codex-agent'),
    aliases: ['codex agent', 'codex-agent'],
    description:
      'Codex-agent workspace for personal context graph, linked-app context, and assistant/action execution.'
  },
  {
    id: codingFallbackRepoId,
    cwd: resolveFromRepoRoot('tmp'),
    aliases: ['tmp', 'temporary workspace', 'scratch workspace'],
    description:
      'Scratch workspace inside the current Open Bubble repo for uncategorized coding requests that still need a fast local repo target.'
  }
];

const normalizeRelevantApps = (apps: unknown): SupportedAppName[] => {
  if (!Array.isArray(apps)) {
    throw new Error('The classifier returned an invalid relevantApps value.');
  }

  const uniqueApps = new Set<SupportedAppName>();

  for (const app of apps) {
    if (typeof app !== 'string') {
      continue;
    }

    if ((supportedApps as readonly string[]).includes(app)) {
      uniqueApps.add(app as SupportedAppName);
    }
  }

  return [...uniqueApps];
};

const isRequestType = (value: unknown): value is RequestType =>
  value === 'coding_request' ||
  value === 'personal_context_request' ||
  value === 'action_request';

const isExecutionMode = (
  value: unknown
): value is PromptHandoffPlan['executionMode'] =>
  value === 'autonomous_code_change' ||
  value === 'context_graph_answer' ||
  value === 'app_action';

const isFinalResponseStyle = (
  value: unknown
): value is PromptHandoffPlan['finalResponseStyle'] =>
  value === 'pull_request_only' ||
  value === 'succinct_answer' ||
  value === 'succinct_confirmation';

const isContextSource = (
  value: unknown
): value is PromptHandoffPlan['contextSources'][number] =>
  typeof value === 'string' &&
  (knownContextSources as readonly string[]).includes(value);

const buildImageDataUrl = (
  buffer: Buffer,
  mimeType: string
): string => `data:${mimeType};base64,${buffer.toString('base64')}`;

const loadRepoCatalogPromptBlock = async (): Promise<string> => {
  try {
    const raw = await readFile(repoConfigPath, 'utf8');
    const parsed = JSON.parse(raw) as RepoCatalogFile;

    if (!Array.isArray(parsed.repos) || parsed.repos.length === 0) {
      return '- (repo catalog unavailable)';
    }

    return parsed.repos
      .flatMap((entry) => {
        if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
          return [];
        }

        const aliases = Array.isArray(entry.aliases)
          ? entry.aliases
              .filter((alias): alias is string => typeof alias === 'string')
              .slice(0, 6)
          : [];
        const description =
          typeof entry.description === 'string' && entry.description.trim().length > 0
            ? entry.description.trim()
            : 'No description provided.';

        return [
          aliases.length > 0
            ? `- ${entry.id}: ${description} aliases=${aliases.join(', ')}`
            : `- ${entry.id}: ${description}`
        ];
      })
      .join('\n');
  } catch {
    return '- (repo catalog unavailable)';
  }
};

const buildClassifierPrompt = async (
  input: PromptTaskProcessorInput
): Promise<string> => {
  const repoCatalog = await loadRepoCatalogPromptBlock();

  return [
    'Analyze this incoming Open Bubble request and prepare a downstream handoff.',
    '',
    '<request>',
    `screenMedia.kind: ${input.screenMedia.kind}`,
    `screenMedia.filename: ${input.screenMedia.filename}`,
    `screenMedia.mimeType: ${input.screenMedia.mimeType}`,
    `promptText: ${input.promptText ?? '(none)'}`,
    input.promptAudio
      ? `promptAudio: present (${input.promptAudio.filename}, ${input.promptAudio.mimeType})`
      : 'promptAudio: none',
    '</request>',
    '',
    '<available_apps>',
    supportedApps.join(', '),
    '</available_apps>',
    '',
    '<repo_catalog>',
    repoCatalog,
    '</repo_catalog>',
    '',
    '<local_context_skills>',
    ...knownContextSkillIds.map((skillId) => `- ${skillId}`),
    '</local_context_skills>',
    '',
    '<ambient_agent_constraints>',
    '- The user may provide only a screenshot, only a short prompt, or both.',
    '- Use the screenshot to infer likely intent when the prompt is sparse.',
    '- Do not invent hidden details; when uncertain, choose the most probable intent grounded in visible evidence.',
    '- The handoff prompt should be rich enough that a downstream Codex agent can execute without additional clarification in common cases.',
    '</ambient_agent_constraints>'
  ].join('\n');
};

const buildClassifierContent = async (
  input: PromptTaskProcessorInput
): Promise<ClassificationContent[]> => {
  const content: ClassificationContent[] = [
    {
      type: 'input_text',
      text: await buildClassifierPrompt(input)
    }
  ];

  if (input.screenMedia.kind === 'image') {
    content.push({
      type: 'input_image',
      image_url: buildImageDataUrl(
        input.screenMediaBuffer,
        input.screenMedia.mimeType
      ),
      detail: 'auto'
    });
  }

  return content;
};

const normalizeSuggestedSkills = (skills: unknown): string[] => {
  if (!Array.isArray(skills)) {
    throw new Error('The classifier returned an invalid suggestedSkills value.');
  }

  const allowed = new Set<string>(knownContextSkillIds);
  const unique = new Set<string>();

  for (const skill of skills) {
    if (typeof skill === 'string' && allowed.has(skill)) {
      unique.add(skill);
    }
  }

  return [...unique];
};

const normalizeContextSources = (
  sources: unknown
): PromptHandoffPlan['contextSources'] => {
  if (!Array.isArray(sources)) {
    throw new Error('The classifier returned an invalid contextSources value.');
  }

  const unique = new Set<PromptHandoffPlan['contextSources'][number]>();

  for (const source of sources) {
    if (isContextSource(source)) {
      unique.add(source);
    }
  }

  if (unique.size === 0) {
    throw new Error('The classifier returned no valid contextSources.');
  }

  return [...unique];
};

const parseClassifierOutput = (
  payload: string,
  repoMappings: RepoMapping[]
): ClassifiedRequest => {
  const parsed = JSON.parse(payload) as RawClassification;

  if (!isRequestType(parsed.requestType)) {
    throw new Error('The classifier returned an invalid requestType value.');
  }

  if (typeof parsed.rationale !== 'string' || parsed.rationale.trim().length === 0) {
    throw new Error('The classifier returned an invalid rationale value.');
  }

  if (
    !parsed.handoffPlan ||
    typeof parsed.handoffPlan !== 'object' ||
    Array.isArray(parsed.handoffPlan)
  ) {
    throw new Error('The classifier returned an invalid handoffPlan value.');
  }

  const rawHandoff = parsed.handoffPlan as Record<string, unknown>;

  if (!isExecutionMode(rawHandoff['executionMode'])) {
    throw new Error('The classifier returned an invalid executionMode value.');
  }

  if (!isFinalResponseStyle(rawHandoff['finalResponseStyle'])) {
    throw new Error('The classifier returned an invalid finalResponseStyle value.');
  }

  if (
    typeof rawHandoff['inferredIntent'] !== 'string' ||
    rawHandoff['inferredIntent'].trim().length === 0
  ) {
    throw new Error('The classifier returned an invalid inferredIntent value.');
  }

  if (
    typeof rawHandoff['inferredDeliverable'] !== 'string' ||
    rawHandoff['inferredDeliverable'].trim().length === 0
  ) {
    throw new Error(
      'The classifier returned an invalid inferredDeliverable value.'
    );
  }

  if (
    typeof rawHandoff['screenshotSummary'] !== 'string' ||
    rawHandoff['screenshotSummary'].trim().length === 0
  ) {
    throw new Error('The classifier returned an invalid screenshotSummary value.');
  }

  if (
    typeof rawHandoff['expandedPrompt'] !== 'string' ||
    rawHandoff['expandedPrompt'].trim().length === 0
  ) {
    throw new Error('The classifier returned an invalid expandedPrompt value.');
  }

  const targetRepoId =
    rawHandoff['targetRepoId'] === null
      ? null
      : typeof rawHandoff['targetRepoId'] === 'string' &&
          rawHandoff['targetRepoId'].trim().length > 0
        ? rawHandoff['targetRepoId'].trim()
        : null;

  if (parsed.requestType === 'coding_request' && targetRepoId) {
    try {
      resolveRepoById(targetRepoId, repoMappings);
    } catch {
      // Let routing fall back to tmp when the classifier suggests an unknown repo.
    }
  }

  return {
    classification: {
      requestType: parsed.requestType,
      relevantApps: normalizeRelevantApps(parsed.relevantApps),
      rationale: parsed.rationale.trim(),
      ...(parsed.requestType === 'coding_request' && targetRepoId
        ? { repoId: targetRepoId }
        : {})
    },
    handoffPlan: {
      executionMode: rawHandoff['executionMode'],
      finalResponseStyle: rawHandoff['finalResponseStyle'],
      inferredIntent: rawHandoff['inferredIntent'].trim(),
      inferredDeliverable: rawHandoff['inferredDeliverable'].trim(),
      screenshotSummary: rawHandoff['screenshotSummary'].trim(),
      contextSources: normalizeContextSources(rawHandoff['contextSources']),
      suggestedSkills: normalizeSuggestedSkills(rawHandoff['suggestedSkills']),
      targetRepoId,
      expandedPrompt: rawHandoff['expandedPrompt'].trim()
    }
  };
};

const classifyRequest = async (
  input: PromptTaskProcessorInput,
  client: ClassificationClient,
  repoMappings: RepoMapping[]
): Promise<ClassifiedRequest> => {
  const model =
    process.env['OPEN_BUBBLE_CLASSIFIER_MODEL']?.trim() ??
    defaultClassifierModel;

  const response = await client.createResponse({
    model,
    store: false,
    reasoning: {
      effort: 'none'
    },
    text: {
      verbosity: 'low',
      format: classificationSchema
    },
    max_output_tokens: 1400,
    instructions: classifierInstructions,
    input: [
      {
        role: 'user',
        content: await buildClassifierContent(input)
      }
    ]
  });

  if (response.status === 'incomplete') {
    throw new Error(
      `The classifier response was incomplete: ${response.incomplete_details?.reason ?? 'unknown_reason'}.`
    );
  }

  if (!response.output_text || response.output_text.trim().length === 0) {
    throw new Error('The classifier returned no structured output.');
  }

  return parseClassifierOutput(response.output_text, repoMappings);
};

const ensureScratchWorkspace = async (): Promise<string> => {
  const tmpDir = resolveFromRepoRoot('tmp');
  await mkdir(tmpDir, { recursive: true });
  return tmpDir;
};

const buildExecutionTarget = async (
  repoId: string,
  repoMappings: RepoMapping[],
  mode: RoutingExecutionTarget['mode'],
  source: RoutingExecutionTarget['source']
): Promise<RoutingExecutionTarget> => {
  const repo = resolveRepoById(repoId, repoMappings);

  if (repo.id === codingFallbackRepoId) {
    await mkdir(repo.cwd, { recursive: true });
  }

  return {
    repoId: repo.id,
    cwd: repo.cwd,
    mode,
    source
  };
};

const buildFallbackCodingTarget = async (): Promise<RoutingExecutionTarget> => ({
  repoId: codingFallbackRepoId,
  cwd: await ensureScratchWorkspace(),
  mode: 'coding',
  source: 'coding_fallback'
});

const resolveExecutionTarget = async (
  classified: ClassifiedRequest,
  repoMappings: RepoMapping[]
): Promise<RoutingExecutionTarget> => {
  if (classified.classification.requestType === 'personal_context_request') {
    return buildExecutionTarget(
      assistantWorkspaceRepoId,
      repoMappings,
      'assistant',
      'personal_context'
    );
  }

  if (classified.classification.requestType === 'action_request') {
    return buildExecutionTarget(
      assistantWorkspaceRepoId,
      repoMappings,
      'assistant',
      'action_request'
    );
  }

  if (classified.handoffPlan.targetRepoId) {
    try {
      return await buildExecutionTarget(
        classified.handoffPlan.targetRepoId,
        repoMappings,
        'coding',
        'classifier_repo'
      );
    } catch {
      return buildFallbackCodingTarget();
    }
  }

  return buildFallbackCodingTarget();
};

const buildRoutingPayload = async (
  input: PromptTaskProcessorInput,
  classified: ClassifiedRequest,
  executionTarget: RoutingExecutionTarget
): Promise<RoutingPayload> => ({
  ...(input.promptText ? { promptText: input.promptText } : {}),
  ...(input.promptAudio && input.promptAudioPath
    ? {
        promptAudio: input.promptAudio,
        promptAudioPath: input.promptAudioPath
      }
    : {}),
  screenMedia: input.screenMedia,
  screenMediaPath: input.screenMediaPath,
  classification: classified.classification,
  handoffPlan: classified.handoffPlan,
  executionTarget
});

const persistRoutingPayload = async (
  taskDir: string,
  payload: RoutingPayload
): Promise<void> => {
  await writeFile(
    path.join(taskDir, routingPayloadFileName),
    JSON.stringify(payload, null, 2)
  );
};

const buildClassificationOnlyAnswer = (
  classification: RequestClassification,
  handoffPlan: PromptHandoffPlan,
  executionTarget: RoutingExecutionTarget
): string => {
  const appSuffix =
    classification.relevantApps.length > 0
      ? ` Relevant apps: ${classification.relevantApps.join(', ')}.`
      : '';
  const repoSuffix = handoffPlan.targetRepoId
    ? ` Target repo: ${handoffPlan.targetRepoId}.`
    : ` Routed to: ${executionTarget.repoId}.`;

  return `Prepared ${classification.requestType} handoff.${appSuffix}${repoSuffix}`;
};

const buildExecutionPromptText = (classified: ClassifiedRequest): string =>
  classified.handoffPlan.expandedPrompt;

const toGatewayScreenMedia = (
  input: PromptTaskProcessorInput
):
  | {
      filename: string;
      mimeType: string;
      kind: 'image';
      path: string;
    }
  | undefined =>
  input.screenMedia.kind === 'image'
    ? {
        ...input.screenMedia,
        kind: 'image',
        path: input.screenMediaPath
      }
    : undefined;

const toTaskFailure = (error: unknown): TaskFailure | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const errorRecord = error as Error & {
    code?: unknown;
    details?: {
      repoId?: unknown;
      threadId?: unknown;
      turnId?: unknown;
    };
  };

  if (typeof errorRecord.code !== 'string') {
    return undefined;
  }

  return {
    code: errorRecord.code,
    message: error.message,
    ...(typeof errorRecord.details?.repoId === 'string'
      ? { repoId: errorRecord.details.repoId }
      : {}),
    ...(typeof errorRecord.details?.threadId === 'string'
      ? { threadId: errorRecord.details.threadId }
      : {}),
    ...(typeof errorRecord.details?.turnId === 'string'
      ? { turnId: errorRecord.details.turnId }
      : {})
  };
};

export const createClassifierPromptTaskProcessor = (
  options: CreateClassifierPromptTaskProcessorOptions = {}
): PromptTaskProcessor => {
  const client = options.client ?? createOpenAiClient();
  const repoMappings = options.repoMappings ?? buildLocalFallbackRepoMappings();
  const executor = options.executor;

  return async (input) => {
    const classified = await classifyRequest(input, client, repoMappings);
    const executionTarget = await resolveExecutionTarget(classified, repoMappings);
    const routingPayload = await buildRoutingPayload(
      input,
      classified,
      executionTarget
    );

    await persistRoutingPayload(input.taskDir, routingPayload);

    if (!executor) {
      return {
        status: 'completed',
        result: {
          answer: buildClassificationOnlyAnswer(
            classified.classification,
            classified.handoffPlan,
            executionTarget
          ),
          repoId: executionTarget.repoId,
          classification: classified.classification,
          routingPayload
        }
      };
    }

    await input.updateTask({
      repoId: executionTarget.repoId
    });

    try {
      const gatewayScreenMedia = toGatewayScreenMedia(input);
      const execution = await executor.executePrompt({
        promptText: buildExecutionPromptText(classified),
        ...(input.promptAudioPath ? { promptAudioPath: input.promptAudioPath } : {}),
        ...(gatewayScreenMedia ? { screenMedia: gatewayScreenMedia } : {}),
        route: {
          repoId: executionTarget.repoId,
          mode: executionTarget.mode,
          requestType: classified.classification.requestType,
          relevantApps: classified.classification.relevantApps,
          rationale: classified.classification.rationale
        },
        onProgress: async (patch) => {
          await input.updateTask({
            repoId: executionTarget.repoId,
            ...patch
          });
        }
      });

      return {
        status: 'completed',
        result: {
          answer: execution.answer,
          ...(execution.prUrl ? { pullRequestUrl: execution.prUrl } : {}),
          ...(execution.branchName ? { branchName: execution.branchName } : {}),
          ...(execution.commitSha ? { commitSha: execution.commitSha } : {}),
          repoId: execution.repoId,
          threadId: execution.threadId,
          turnId: execution.turnId,
          classification: classified.classification,
          routingPayload
        }
      };
    } catch (error) {
      const failure = toTaskFailure(error);

      if (failure) {
        return {
          status: 'failed',
          errorDetail: {
            ...failure,
            ...(failure.repoId ? {} : { repoId: executionTarget.repoId })
          }
        };
      }

      throw error;
    }
  };
};

export const createConfiguredClassifierExecutionTaskProcessor = async (
  options: CreateClassifierPromptTaskProcessorOptions = {}
): Promise<PromptTaskProcessor> => {
  const repoMappings = options.repoMappings ?? await loadRepoMappings();
  const executor =
    options.executor ?? createPromptExecutorFromMappings(repoMappings);

  return createClassifierPromptTaskProcessor({
    ...options,
    repoMappings,
    executor
  });
};
