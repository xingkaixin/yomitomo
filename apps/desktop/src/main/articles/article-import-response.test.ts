import { describe, expect, it, vi } from 'vitest';
import { readArticleImportResponseBytes } from './article-import-response';

describe('readArticleImportResponseBytes', () => {
  it('cancels a stalled read when aborted instead of returning a truncated body', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const result = readArticleImportResponseBytes(new Response(body), 5, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
});
