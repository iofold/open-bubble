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

export type ScreenMediaKind = 'image' | 'video';

export interface ScreenMediaMetadata {
  filename: string;
  mimeType: string;
  kind: ScreenMediaKind;
}

export interface PromptAudioMetadata {
  filename: string;
  mimeType: string;
}

export interface PromptResponse {
  answer: string;
  screenMedia: ScreenMediaMetadata;
  receivedAt: string;
  promptText?: string;
  promptAudio?: PromptAudioMetadata;
}

interface ParsedPromptRequest {
  screenMedia: ScreenMediaMetadata;
  promptText?: string;
  promptAudio?: PromptAudioMetadata;
}

interface ErrorResponse {
  error: 'bad_request' | 'unsupported_media_type';
  message: string;
}

const trimPromptText = (value: MultipartValue['value']): string | undefined => {
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const readFilePart = async (part: MultipartFile): Promise<void> => {
  await part.toBuffer();
};

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
  let screenMedia: ScreenMediaMetadata | undefined;
  let promptText: string | undefined;
  let promptAudio: PromptAudioMetadata | undefined;

  const parts = request.parts();

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

        await readFilePart(filePart);
        screenMedia = {
          filename: getSafeFilename(filePart.filename),
          mimeType: filePart.mimetype,
          kind
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

        await readFilePart(filePart);
        promptAudio = {
          filename: getSafeFilename(filePart.filename),
          mimeType: filePart.mimetype
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

const buildAnswer = (payload: ParsedPromptRequest): string => {
  const screenLabel =
    payload.screenMedia.kind === 'image' ? 'screenshot' : 'screen recording';

  if (payload.promptText && payload.promptAudio) {
    return `Dummy response for ${screenLabel} with text and raw audio prompt input.`;
  }

  if (payload.promptAudio) {
    return `Dummy response for ${screenLabel} with raw audio prompt input.`;
  }

  return `Dummy response for ${screenLabel} with text prompt input.`;
};

export const promptRoute: FastifyPluginAsync = async (app) => {
  app.post('/prompt', async (request, reply): Promise<PromptResponse | FastifyReply> => {
    const parsed = await parsePromptRequest(request, reply);

    if (!parsed) {
      return reply;
    }

    const response: PromptResponse = {
      answer: buildAnswer(parsed),
      screenMedia: parsed.screenMedia,
      receivedAt: new Date().toISOString()
    };

    if (parsed.promptText) {
      response.promptText = parsed.promptText;
    }

    if (parsed.promptAudio) {
      response.promptAudio = parsed.promptAudio;
    }

    return response;
  });
};
