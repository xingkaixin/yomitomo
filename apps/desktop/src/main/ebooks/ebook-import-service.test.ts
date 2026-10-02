import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_EBOOK_IMPORT_BYTES } from '../../ipc/article-import-boundary';
import { importEbookInWorker } from './ebook-import-service';

const mocks = vi.hoisted(() => ({ createWorker: vi.fn<typeof TestWorker>() }));
vi.mock('node:worker_threads', () => ({ Worker: mocks.createWorker }));

class TestWorker extends EventEmitter {
  terminate = vi.fn(async () => 0);
}

let worker: TestWorker;
const input = { fileName: 'book.epub', data: new ArrayBuffer(4) };

beforeEach(() => {
  worker = new TestWorker();
  mocks.createWorker.mockReset().mockImplementation(
    class extends TestWorker {
      constructor() {
        super();
        return worker;
      }
    },
  );
});

afterEach(() => vi.useRealTimers());

describe('importEbookInWorker', () => {
  it('returns the parsed record, keeps source bytes and forwards timing logs', async () => {
    const performanceLogger = vi.fn();
    const pending = importEbookInWorker(input, { performanceLogger });
    const article = { id: 'book', legacyId: 'legacy' };
    worker.emit('message', {
      ok: true,
      article,
      timings: [{ event: 'ebook-import', data: { phase: 'parse' } }],
    });
    expect(await pending).toEqual(article);
    expect(mocks.createWorker).toHaveBeenCalledWith(expect.any(URL), { workerData: input });
    expect(input.data.byteLength).toBe(4);
    expect(performanceLogger).toHaveBeenCalledWith('ebook-import', { phase: 'parse' });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.eventNames()).toEqual([]);
  });

  it('preserves parser error codes across the worker boundary', async () => {
    const pending = importEbookInWorker(input);
    worker.emit('message', { ok: false, code: 'EBOOK_IMPORT_DRM_PROTECTED', timings: [] });
    await expect(pending).rejects.toMatchObject({ importCode: 'EBOOK_IMPORT_DRM_PROTECTED' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([0, 1])('rejects worker exit %s without a result', async (code) => {
    const pending = importEbookInWorker(input);
    worker.emit('exit', code);
    await expect(pending).rejects.toMatchObject({ importCode: 'EBOOK_IMPORT_WORKER_EXITED' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('contains a worker error and waits for termination before rejecting', async () => {
    let finishExit: (code: number) => void = () => {};
    worker.terminate.mockReturnValue(
      new Promise<number>((resolve) => {
        finishExit = resolve;
      }),
    );
    const pending = importEbookInWorker(input);
    const assertion = expect(pending).rejects.toMatchObject({
      importCode: 'EBOOK_IMPORT_PARSE_FAILED',
    });
    worker.emit('error', new Error('worker failure'));
    expect(worker.terminate).toHaveBeenCalledOnce();
    finishExit(1);
    await assertion;
  });

  it('terminates a stalled worker when the import times out', async () => {
    vi.useFakeTimers();
    const pending = importEbookInWorker(input);
    const assertion = expect(pending).rejects.toMatchObject({ importCode: 'EBOOK_IMPORT_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.eventNames()).toEqual([]);
  });

  it('rejects oversized files before cloning them into a worker', async () => {
    await expect(
      importEbookInWorker({ ...input, data: new ArrayBuffer(MAX_EBOOK_IMPORT_BYTES + 1) }),
    ).rejects.toMatchObject({ importCode: 'EBOOK_IMPORT_FILE_TOO_LARGE' });
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });
});
