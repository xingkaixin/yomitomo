import { parentPort, workerData } from 'node:worker_threads';
import { isSourceImportError } from '../../ipc/article-import-boundary';
import { articleRecordFromEbookFile } from './ebook-import';
import type { EbookImportFileInput, EbookImportWorkerResult } from './ebook-import-types';

if (parentPort) {
  const port = parentPort;
  const input: EbookImportFileInput = workerData;
  const timings: EbookImportWorkerResult['timings'] = [];
  void articleRecordFromEbookFile(input, {
    performanceLogger: (event, data) => timings.push({ event, data }),
  }).then(
    (article) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      port.postMessage({ ok: true, article, timings } satisfies EbookImportWorkerResult);
    },
    (error: unknown) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      port.postMessage({
        ok: false,
        code: isSourceImportError(error) ? error.importCode : 'EBOOK_IMPORT_PARSE_FAILED',
        timings,
      } satisfies EbookImportWorkerResult);
    },
  );
}
