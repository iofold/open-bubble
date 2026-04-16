import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest
} from 'fastify';
import type {
  MultipartFile,
  MultipartValue
} from '@fastify/multipart';

export type ScreenMediaKind = 'image';

export interface ScreenMediaMetadata {
  filename: string;
  mimeType: string;
  kind: ScreenMediaKind;
  path: string;
}

export interface PromptExecutionRequest {
  promptText: string;
  screenMedia: ScreenMediaMetadata;
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

export interface PromptRouteOptions {
  promptExecutor?: PromptExecutor;
}

export interface PromptResponse {
  answer: string;
  branchName: string;
  prUrl: string;
  promptText: string;
  repoId: string;
  screenMedia: Omit<ScreenMediaMetadata, 'path'>;
  threadId: string;
  receivedAt: string;
}

interface ParsedPromptRequest {
  promptText: string;
  screenMedia: ScreenMediaMetadata;
  tempDirectory: string;
}

interface ErrorResponse {
  error: 'bad_gateway' | 'bad_request' | 'unsupported_media_type';
  message: string;
}

let defaultPromptExecutorPromise: Promise<PromptExecutor> | undefined;

const trimPromptText = (value: MultipartValue['value']): string | undefined => {
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const getSafeFilename = (filename: string): string =>
  filename.length > 0 ? filename : 'upload.bin';

const createTempImage = async (part: MultipartFile): Promise<ScreenMediaMetadata> => {
  const directory = await mkdtemp(join(tmpdir(), 'open-bubble-'));
  const filename = getSafeFilename(part.filename);
  const path = join(directory, filename);
  const buffer = await part.toBuffer();

  await writeFile(path, buffer);

  return {
    filename,
    mimeType: part.mimetype,
    kind: 'image',
    path
  };
};

const sendBadGateway = (
  reply: FastifyReply,
  message: string
): FastifyReply => {
  const payload: ErrorResponse = {
    error: 'bad_gateway',
    message
  };

  return reply.code(502).send(payload);
};

const sendBadRequest = (
  reply: FastifyReply,
  message: string
): FastifyReply => {
  const payload: ErrorResponse = {
    error: 'bad_request',
    message
  };

  return reply.code(400).send(payload);
};

const sendUnsupportedMediaType = (
  reply: FastifyReply,
  message: string
): FastifyReply => {
  const payload: ErrorResponse = {
    error: 'unsupported_media_type',
    message
  };

  return reply.code(415).send(payload);
};

const getDefaultPromptExecutor = async (): Promise<PromptExecutor> => {
  defaultPromptExecutorPromise ??= import('@open-bubble/codex-app-server')
    .then((module) => module.createConfiguredPromptExecutor());

  return defaultPromptExecutorPromise;
};

const parsePromptRequest = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ParsedPromptRequest | null> => {
  let promptText: string | undefined;
  let screenMedia: ScreenMediaMetadata | undefined;
  let tempDirectory: string | undefined;

  const parts = request.parts();

  for await (const part of parts) {
    if (part.type === 'file') {
      const filePart = part;

      if (filePart.fieldname !== 'screenMedia') {
        await filePart.toBuffer();
        sendBadRequest(reply, `Unexpected file field "${filePart.fieldname}".`);
        return null;
      }

      if (screenMedia) {
        await filePart.toBuffer();
        sendBadRequest(reply, 'Only one screenMedia file is allowed.');
        return null;
      }

      if (!filePart.mimetype.startsWith('image/')) {
        await filePart.toBuffer();
        sendUnsupportedMediaType(
          reply,
          'screenMedia must use an image/* MIME type.'
        );
        return null;
      }

      screenMedia = await createTempImage(filePart);
      tempDirectory = dirname(screenMedia.path);
      continue;
    }

    const valuePart = part;

    if (valuePart.fieldname === 'promptText') {
      if (promptText !== undefined) {
        sendBadRequest(reply, 'Only one promptText value is allowed.');
        return null;
      }

      promptText = trimPromptText(valuePart.value);
      continue;
    }

    sendBadRequest(reply, `Unexpected field "${valuePart.fieldname}".`);
    return null;
  }

  if (!screenMedia || !tempDirectory) {
    sendBadRequest(reply, 'screenMedia is required.');
    return null;
  }

  if (!promptText) {
    await rm(tempDirectory, {
      force: true,
      recursive: true
    });

    sendBadRequest(reply, 'promptText is required.');
    return null;
  }

  return {
    promptText,
    screenMedia,
    tempDirectory
  };
};

export const promptRoute: FastifyPluginAsync<PromptRouteOptions> = async (
  app,
  options
) => {
  app.post('/prompt', async (request, reply): Promise<PromptResponse | FastifyReply> => {
    const parsed = await parsePromptRequest(request, reply);

    if (!parsed) {
      return reply;
    }

    const executor = options.promptExecutor ?? await getDefaultPromptExecutor();

    try {
      const result = await executor.executePrompt({
        promptText: parsed.promptText,
        screenMedia: parsed.screenMedia
      });

      const response: PromptResponse = {
        answer: result.answer,
        branchName: result.branchName,
        prUrl: result.prUrl,
        promptText: parsed.promptText,
        repoId: result.repoId,
        screenMedia: {
          filename: parsed.screenMedia.filename,
          mimeType: parsed.screenMedia.mimeType,
          kind: parsed.screenMedia.kind
        },
        threadId: result.threadId,
        receivedAt: new Date().toISOString()
      };

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Codex bridge error.';
      return sendBadGateway(reply, message);
    } finally {
      await rm(parsed.tempDirectory, {
        force: true,
        recursive: true
      });
    }
  });
};
