import { SourceImportError } from '../../ipc/article-import-boundary';

export async function readArticleImportResponseBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length')?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new SourceImportError('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
  }

  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });

  try {
    for (;;) {
      throwIfSignalAborted(signal);
      const { done, value } = await reader.read();
      throwIfSignalAborted(signal);
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        throw new SourceImportError('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function throwIfSignalAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('aborted');
  error.name = 'AbortError';
  throw error;
}
