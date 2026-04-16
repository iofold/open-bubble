import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import OpenAI from 'openai';
import { resolveFromRepoRoot } from './openapi.js';
import type {
  PromptHandoffPlan,
  PromptTaskProcessor,
  PromptTaskProcessorInput,
  RequestClassification,
  RequestType,
  RoutingPayload
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

interface RepoCatalogEntry {
  id?: unknown;
  aliases?: unknown;
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
  'Keep rationale short and concrete, but make expandedPrompt rich and explicit.',
  'Examples:',
  '- Insurance policy number visible in an email or message on screen -> personal_context_request, executionMode=context_graph_answer, finalResponseStyle=succinct_answer, relevantApps may include Gmail, suggestedSkills should point to the context-answer or connector skills.',
  '- Bug visible in Headrest, Open Bubble, Tray, or another app repo -> coding_request, executionMode=autonomous_code_change, finalResponseStyle=pull_request_only, targetRepoId should match the repo catalog when possible.',
  '- Scheduling thread with two or three people visible on screen -> action_request, executionMode=app_action, finalResponseStyle=succinct_confirmation, relevantApps may include Gmail and Gcal.'
].join('\n');

const classificationSchema = {
  type: 'json_schema' as const,
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

interface ClassificationRequest {
  model: string;
  store: false;
  reasoning: {
    effort: 'low';
  };
  text: {
    verbosity: 'low';
    format: typeof classificationSchema;
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

        return [
          aliases.length > 0
            ? `- ${entry.id}: aliases=${aliases.join(', ')}`
            : `- ${entry.id}`
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

const parseClassifierOutput = (payload: string): ClassifiedRequest => {
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

  return {
    classification: {
      requestType: parsed.requestType,
      relevantApps: normalizeRelevantApps(parsed.relevantApps),
      rationale: parsed.rationale.trim()
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
  client: ClassificationClient
): Promise<ClassifiedRequest> => {
  const model =
    process.env['OPEN_BUBBLE_CLASSIFIER_MODEL']?.trim() ??
    defaultClassifierModel;

  const response = await client.createResponse({
    model,
    store: false,
    reasoning: {
      effort: 'low'
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

  return parseClassifierOutput(response.output_text);
};

const ensureDefaultCodingCwd = async (): Promise<string> => {
  const tmpDir = resolveFromRepoRoot('tmp');
  await mkdir(tmpDir, { recursive: true });
  return tmpDir;
};

const buildRoutingPayload = async (
  input: PromptTaskProcessorInput,
  classified: ClassifiedRequest
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
  ...(classified.classification.requestType === 'coding_request'
    ? { defaultCodingCwd: await ensureDefaultCodingCwd() }
    : {})
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

const buildAnswer = (
  classification: RequestClassification,
  handoffPlan: PromptHandoffPlan
): string => {
  const appSuffix =
    classification.relevantApps.length > 0
      ? ` Relevant apps: ${classification.relevantApps.join(', ')}.`
      : '';
  const repoSuffix = handoffPlan.targetRepoId
    ? ` Target repo: ${handoffPlan.targetRepoId}.`
    : '';

  return `Prepared ${classification.requestType} handoff.${appSuffix}${repoSuffix}`;
};

export const createClassifierPromptTaskProcessor = (
  options: CreateClassifierPromptTaskProcessorOptions = {}
): PromptTaskProcessor => {
  const client = options.client ?? createOpenAiClient();

  return async (input) => {
    const classified = await classifyRequest(input, client);
    const routingPayload = await buildRoutingPayload(input, classified);

    await persistRoutingPayload(input.taskDir, routingPayload);

    return {
      status: 'completed',
      result: {
        answer: buildAnswer(
          classified.classification,
          classified.handoffPlan
        ),
        classification: classified.classification,
        routingPayload
      }
    };
  };
};
