import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest
} from 'fastify';
import type {
  Multipart,
  MultipartFile,
  MultipartValue
} from '@fastify/multipart';
import type {
  ParsedPromptRequest,
  PromptAcceptedResponse,
  PromptAudioMetadata,
  PromptTaskManager,
  ScreenMediaKind,
  ScreenMediaMetadata
} from '../lib/task-manager.js';

interface ErrorResponse {
  error: 'bad_request' | 'unsupported_media_type';
  message: string;
}

const trimPromptText = (value: MultipartValue['value']): string | undefined => {
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const readFilePart = async (part: MultipartFile): Promise<Buffer> =>
  part.toBuffer();

const getScreenMediaKind = (mimeType: string): ScreenMediaKind | undefined => {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  return undefined;
};

const getSafeFilename = (filename: string): string =>
  filename.length > 0 ? filename : 'upload.bin';

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

const parsePromptRequest = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ParsedPromptRequest | null> => {
  let screenMedia:
    | {
        buffer: Buffer;
        metadata: ScreenMediaMetadata;
      }
    | undefined;
  let promptText: string | undefined;
  let promptAudio:
    | {
        buffer: Buffer;
        metadata: PromptAudioMetadata;
      }
    | undefined;

  const parts: AsyncIterableIterator<Multipart> = request.parts();

  for await (const part of parts) {
    if (part.type === 'file') {
      const filePart: MultipartFile = part;

      if (filePart.fieldname === 'screenMedia') {
        if (screenMedia) {
          await readFilePart(filePart);
          sendBadRequest(reply, 'Only one screenMedia file is allowed.');
          return null;
        }

        const kind = getScreenMediaKind(filePart.mimetype);

        if (!kind) {
          await readFilePart(filePart);
          sendUnsupportedMediaType(
            reply,
            'screenMedia must use an image/* or video/* MIME type.'
          );
          return null;
        }

        const buffer = await readFilePart(filePart);
        screenMedia = {
          buffer,
          metadata: {
            filename: getSafeFilename(filePart.filename),
            mimeType: filePart.mimetype,
            kind
          }
        };
        continue;
      }

      if (filePart.fieldname === 'promptAudio') {
        if (promptAudio) {
          await readFilePart(filePart);
          sendBadRequest(reply, 'Only one promptAudio file is allowed.');
          return null;
        }

        if (!filePart.mimetype.startsWith('audio/')) {
          await readFilePart(filePart);
          sendUnsupportedMediaType(
            reply,
            'promptAudio must use an audio/* MIME type.'
          );
          return null;
        }

        const buffer = await readFilePart(filePart);
        promptAudio = {
          buffer,
          metadata: {
            filename: getSafeFilename(filePart.filename),
            mimeType: filePart.mimetype
          }
        };
        continue;
      }

      await readFilePart(filePart);
      sendBadRequest(reply, `Unexpected file field "${filePart.fieldname}".`);
      return null;
    }

    const valuePart: MultipartValue = part;

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

  if (!screenMedia) {
    sendBadRequest(reply, 'screenMedia is required.');
    return null;
  }

  if (!promptText && !promptAudio) {
    sendBadRequest(
      reply,
      'At least one of promptText or promptAudio is required.'
    );
    return null;
  }

  const parsed: ParsedPromptRequest = {
    screenMedia
  };

  if (promptText) {
    parsed.promptText = promptText;
  }

  if (promptAudio) {
    parsed.promptAudio = promptAudio;
  }

  return parsed;
};

export const promptRoute = ({
  taskManager
}: {
  taskManager: PromptTaskManager;
}): FastifyPluginAsync => {
  const route: FastifyPluginAsync = async (app) => {
    app.post(
      '/prompt',
      async (
        request,
        reply
      ): Promise<PromptAcceptedResponse | FastifyReply> => {
        const parsed = await parsePromptRequest(request, reply);

        if (!parsed) {
          return reply;
        }

        const task = await taskManager.createTask(parsed);
        return reply.code(202).send(task);
      }
    );
  };

  return route;
};
