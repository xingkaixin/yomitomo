import { describe, expect, it, vi } from 'vitest';
import { readArticleImportResponseBytes } from './article-import-response';

describe('readArticleImportResponseBytes', () => {
  it('combines chunks at the exact byte limit and releases the reader', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4, 5]));
        controller.close();
      },
    });
    const result = await readArticleImportResponseBytes(
      new Response(body),
      5,
      new AbortController().signal,
    );
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(body.locked).toBe(false);
  });

  it('cancels before reading the remaining chunks after crossing the byte limit', async () => {
    let produced = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          produced += 1;
          controller.enqueue(new Uint8Array(2));
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    await expect(
      readArticleImportResponseBytes(new Response(body), 5, new AbortController().signal),
    ).rejects.toThrow('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
    expect(produced).toBe(3);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('cancels a declared oversized body without consuming it', async () => {
    const pull = vi.fn();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const response = new Response(body, { headers: { 'content-length': '6' } });
    await expect(
      readArticleImportResponseBytes(response, 5, new AbortController().signal),
    ).rejects.toThrow('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

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

  it('releases the reader when the source stream fails', async () => {
    const error = new Error('connection closed');
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(error);
      },
    });
    await expect(
      readArticleImportResponseBytes(new Response(body), 5, new AbortController().signal),
    ).rejects.toBe(error);
    expect(body.locked).toBe(false);
  });
});
