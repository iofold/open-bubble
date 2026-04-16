import {
  inferRepoFromPrompt,
  type RepoMapping,
  type RepoSelection
} from './infer.js';
import {
  LocalCodexAppServerGateway,
  type CodexPromptGateway,
  type GatewayScreenMedia
} from './gateway.js';
import { loadRepoMappings } from './config.js';

export interface PromptExecutionRequest {
  promptText: string;
  screenMedia: GatewayScreenMedia;
}

export interface PromptExecutionResult {
  answer: string;
  branchName: string;
  prUrl: string;
  repoId: string;
  threadId: string;
}

export interface PromptExecutor {
  executePrompt(request: PromptExecutionRequest): Promise<PromptExecutionResult>;
}

export interface PromptOrchestratorOptions {
  inferRepo: (promptText: string) => RepoSelection;
  gateway: CodexPromptGateway;
}

export const createPromptOrchestrator = (
  options: PromptOrchestratorOptions
): PromptExecutor => ({
  async executePrompt(request): Promise<PromptExecutionResult> {
    const repo = options.inferRepo(request.promptText);
    const result = await options.gateway.runPrompt({
      promptText: request.promptText,
      repo,
      screenMedia: request.screenMedia
    });

    return {
      ...result,
      repoId: repo.id
    };
  }
});

export const createPromptExecutorFromMappings = (
  mappings: RepoMapping[],
  gateway: CodexPromptGateway = new LocalCodexAppServerGateway()
): PromptExecutor =>
  createPromptOrchestrator({
    inferRepo: (promptText) => inferRepoFromPrompt(promptText, mappings),
    gateway
  });

export const createConfiguredPromptExecutor = async (): Promise<PromptExecutor> => {
  const mappings = await loadRepoMappings();
  return createPromptExecutorFromMappings(mappings);
};

export type { CodexPromptGateway } from './gateway.js';
