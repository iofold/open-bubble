import type { RepoSelection } from './infer.js';
import {
  isErrorNotification,
  isItemCompletedNotification,
  isTurnCompletedNotification,
  JsonRpcTransport
} from './transport.js';

interface InitializeResponse {
  userAgent: string;
}

interface ThreadStartResponse {
  thread: {
    id: string;
  };
}

interface TurnStartResponse {
  turn: {
    id: string;
  };
}

export interface GatewayScreenMedia {
  filename: string;
  kind: 'image';
  mimeType: string;
  path: string;
}

export interface GatewayPromptRequest {
  promptText: string;
  repo: RepoSelection;
  screenMedia: GatewayScreenMedia;
}

export interface GatewayPromptResult {
  answer: string;
  branchName: string;
  prUrl: string;
  threadId: string;
}

export interface CodexPromptGateway {
  runPrompt(request: GatewayPromptRequest): Promise<GatewayPromptResult>;
}

interface FinalOutput {
  answer: string;
  branchName: string;
  prUrl: string;
}

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'branchName', 'prUrl'],
  properties: {
    answer: {
      type: 'string'
    },
    branchName: {
      type: 'string'
    },
    prUrl: {
      type: 'string',
      format: 'uri'
    }
  }
};

const stripCodeFences = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/u, '')
    .replace(/\s*```$/u, '')
    .trim();
};

const parseFinalOutput = (value: string): FinalOutput => {
  const normalized = stripCodeFences(value);
  const parsed = JSON.parse(normalized) as FinalOutput;

  if (
    typeof parsed.answer !== 'string' ||
    typeof parsed.branchName !== 'string' ||
    typeof parsed.prUrl !== 'string'
  ) {
    throw new Error('Codex returned an invalid final payload.');
  }

  return parsed;
};

const buildPrompt = (request: GatewayPromptRequest): string => `
You are handling a mobile coding request in the inferred repository "${request.repo.id}".
Interpret the user's intent from the screenshot and prompt text.
Do not ask follow-up questions.
Make the smallest reasonable change that satisfies the request.
Run relevant checks.
Create a branch, commit the work, push it, and open a pull request.
Return only JSON that matches the required schema.

User request:
${request.promptText}
`.trim();

export class LocalCodexAppServerGateway implements CodexPromptGateway {
  constructor(
    private readonly options: {
      command?: string;
      timeoutMs?: number;
      model?: string;
      serviceName?: string;
    } = {}
  ) {}

  async runPrompt(request: GatewayPromptRequest): Promise<GatewayPromptResult> {
    const transport = new JsonRpcTransport(this.options.command ?? 'codex');
    const timeoutMs = this.options.timeoutMs ?? 10 * 60 * 1000;

    let finalAgentMessage = '';
    let turnCompleted = false;

    const waitForCompletion = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for Codex after ${String(timeoutMs)}ms.`));
      }, timeoutMs);

      transport.onNotification((notification) => {
        if (isErrorNotification(notification)) {
          clearTimeout(timer);
          reject(new Error(notification.params.error.message));
          return;
        }

        if (
          isItemCompletedNotification(notification) &&
          notification.params.item.type === 'agentMessage'
        ) {
          finalAgentMessage = notification.params.item.text ?? '';
          return;
        }

        if (isTurnCompletedNotification(notification)) {
          clearTimeout(timer);

          if (notification.params.turn.status !== 'completed') {
            reject(
              new Error(
                `Codex turn ended with status "${notification.params.turn.status}".`
              )
            );
            return;
          }

          turnCompleted = true;
          resolve();
        }
      });
    });

    try {
      await transport.request<InitializeResponse>({
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'open_bubble',
            title: 'Open Bubble',
            version: '0.1.0'
          },
          capabilities: null
        }
      });

      transport.notify({
        method: 'initialized'
      });

      const threadResponse = await transport.request<ThreadStartResponse>({
        method: 'thread/start',
        params: {
          model: this.options.model ?? 'gpt-5.4',
          cwd: request.repo.cwd,
          approvalPolicy: 'never',
          sandbox: 'workspace-write',
          serviceName: this.options.serviceName ?? 'open_bubble',
          experimentalRawEvents: false,
          persistExtendedHistory: false
        }
      });

      await transport.request<TurnStartResponse>({
        method: 'turn/start',
        params: {
          threadId: threadResponse.thread.id,
          input: [
            {
              type: 'text',
              text: buildPrompt(request),
              text_elements: []
            },
            {
              type: 'localImage',
              path: request.screenMedia.path
            }
          ],
          outputSchema
        }
      });

      await waitForCompletion;

      if (!turnCompleted || finalAgentMessage.trim().length === 0) {
        throw new Error('Codex finished without a final agent message.');
      }

      const output = parseFinalOutput(finalAgentMessage);

      return {
        ...output,
        threadId: threadResponse.thread.id
      };
    } finally {
      await transport.close();
    }
  }
}
