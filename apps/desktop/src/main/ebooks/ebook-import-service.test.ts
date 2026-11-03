import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('preserves parser error codes across the worker boundary', async () => {
    const pending = importEbookInWorker(input);
    worker.emit('message', { ok: false, code: 'EBOOK_IMPORT_DRM_PROTECTED', timings: [] });
    await expect(pending).rejects.toMatchObject({ importCode: 'EBOOK_IMPORT_DRM_PROTECTED' });
    expect(worker.terminate).toHaveBeenCalledOnce();
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
});
