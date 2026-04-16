const createBoundary = (): string =>
  `----open-bubble-${Math.random().toString(16).slice(2)}`;

export interface FileField {
  fieldName: string;
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface TextField {
  fieldName: string;
  value: string;
}

export interface MultipartPayload {
  body: Buffer;
  contentType: string;
}

export const createMultipartPayload = (
  fileFields: FileField[],
  textFields: TextField[]
): MultipartPayload => {
  const boundary = createBoundary();
  const chunks: Buffer[] = [];

  for (const field of textFields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${field.fieldName}"\r\n\r\n` +
          `${field.value}\r\n`
      )
    );
  }

  for (const field of fileFields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${field.fieldName}"; filename="${field.filename}"\r\n` +
          `Content-Type: ${field.contentType}\r\n\r\n`
      )
    );
    chunks.push(field.content);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
};
