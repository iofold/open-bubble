import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import OpenAI from 'openai';
import { resolveFromRepoRoot } from './openapi.js';
import type {
  PromptTaskProcessor,
  PromptTaskProcessorInput,
  RequestClassification,
  RequestType,
  RoutingPayload
} from './task-manager.js';
import { supportedApps, type SupportedAppName } from './supported-apps.js';

const defaultClassifierModel = 'gpt-5.4';
const routingPayloadFileName = 'routing-payload.json';

const classifierInstructions = [
  'You are Open Bubble, a personal assistant running on a user phone.',
  'The user invoked you by tapping a button while looking at their current screen.',
  'Classify the request only. Do not answer it. Do not plan execution.',
  'Choose exactly one requestType:',
  '- coding_request: software debugging, building, fixing, reviewing, or product/app behavior work.',
  '- personal_context_request: answering a personal information question using inbox, calendar, notes, docs, insurance, or similar user context.',
  '- action_request: taking or preparing an action such as sending, scheduling, messaging, inviting, or updating something for the user.',
  `relevantApps must only use this exact list when clearly applicable: ${supportedApps.join(', ')}.`,
  'Return an empty relevantApps array when no listed app is clearly relevant.',
  'Keep rationale short and concrete.',
  'No screenshot bytes are attached in this classifier call. Use only the provided prompt text and request metadata.'
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
      }
    },
    required: ['requestType', 'relevantApps', 'rationale'],
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
    format: typeof classificationSchema;
  };
  max_output_tokens: number;
  instructions: string;
  input: Array<{
    role: 'user';
    content: Array<{
      type: 'input_text';
      text: string;
    }>;
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
};

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

const buildClassifierPrompt = (input: PromptTaskProcessorInput): string =>
  [
    'Classify this incoming mobile assistant request.',
    `Available apps: ${supportedApps.join(', ')}`,
    `screenMedia.kind: ${input.screenMedia.kind}`,
    `screenMedia.filename: ${input.screenMedia.filename}`,
    `screenMedia.mimeType: ${input.screenMedia.mimeType}`,
    `promptText: ${input.promptText ?? '(none)'}`,
    input.promptAudio
      ? `promptAudio: present (${input.promptAudio.filename}, ${input.promptAudio.mimeType})`
      : 'promptAudio: none'
  ].join('\n');

const parseClassification = (payload: string): RequestClassification => {
  const parsed = JSON.parse(payload) as RawClassification;

  if (!isRequestType(parsed.requestType)) {
    throw new Error('The classifier returned an invalid requestType value.');
  }

  if (typeof parsed.rationale !== 'string' || parsed.rationale.trim().length === 0) {
    throw new Error('The classifier returned an invalid rationale value.');
  }

  return {
    requestType: parsed.requestType,
    relevantApps: normalizeRelevantApps(parsed.relevantApps),
    rationale: parsed.rationale.trim()
  };
};

const classifyRequest = async (
  input: PromptTaskProcessorInput,
  client: ClassificationClient
): Promise<RequestClassification> => {
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
    max_output_tokens: 160,
    instructions: classifierInstructions,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildClassifierPrompt(input)
          }
        ]
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

  return parseClassification(response.output_text);
};

const ensureDefaultCodingCwd = async (): Promise<string> => {
  const tmpDir = resolveFromRepoRoot('tmp');
  await mkdir(tmpDir, { recursive: true });
  return tmpDir;
};

const buildRoutingPayload = async (
  input: PromptTaskProcessorInput,
  classification: RequestClassification
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
  classification,
  ...(classification.requestType === 'coding_request'
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

const buildAnswer = (classification: RequestClassification): string => {
  const appSuffix =
    classification.relevantApps.length > 0
      ? ` Relevant apps: ${classification.relevantApps.join(', ')}.`
      : '';

  return `Classified request as ${classification.requestType}.${appSuffix}`;
};

export const createClassifierPromptTaskProcessor = (
  options: CreateClassifierPromptTaskProcessorOptions = {}
): PromptTaskProcessor => {
  const client = options.client ?? createOpenAiClient();

  return async (input) => {
    const classification = await classifyRequest(input, client);
    const routingPayload = await buildRoutingPayload(input, classification);

    await persistRoutingPayload(input.taskDir, routingPayload);

    return {
      status: 'completed',
      result: {
        answer: buildAnswer(classification),
        classification,
        routingPayload
      }
    };
  };
};
