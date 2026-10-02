import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { Effect } from 'effect';
import { MAX_EBOOK_IMPORT_BYTES, SourceImportError } from '../../ipc/article-import-boundary';
import type {
  EbookImportFileInput,
  EbookImportOptions,
  EbookImportWorkerResult,
} from './ebook-import-types';

export async function importEbookInWorker(
  input: EbookImportFileInput,
  options: EbookImportOptions = {},
) {
  if (input.data.byteLength > MAX_EBOOK_IMPORT_BYTES) {
    throw new SourceImportError('EBOOK_IMPORT_FILE_TOO_LARGE');
  }
  const result = await Effect.runPromise(
    Effect.acquireUseRelease(
      Effect.try({
        // Keep the original buffer attached: source-file persistence uses it after parsing.
        try: () => new Worker(ebookImportWorkerUrl(), { workerData: input }),
        catch: (cause) => new SourceImportError('EBOOK_IMPORT_PARSE_FAILED', { cause }),
      }),
      (worker) =>
        Effect.callback<EbookImportWorkerResult, SourceImportError>((resume) => {
          worker.once('message', (message: EbookImportWorkerResult) => {
            resume(Effect.succeed(message));
          });
          worker.once('error', (cause) => {
            resume(Effect.fail(new SourceImportError('EBOOK_IMPORT_PARSE_FAILED', { cause })));
          });
          worker.once('exit', () => {
            resume(Effect.fail(new SourceImportError('EBOOK_IMPORT_WORKER_EXITED')));
          });
        }).pipe(
          Effect.timeoutOrElse({
            duration: '2 minutes',
            orElse: () => Effect.fail(new SourceImportError('EBOOK_IMPORT_TIMEOUT')),
          }),
        ),
      (worker) =>
        Effect.promise(async () => {
          await worker.terminate();
          worker.removeAllListeners();
        }),
    ),
  );
  for (const { event, data } of result.timings) options.performanceLogger?.(event, data);
  if (!result.ok) throw new SourceImportError(result.code);
  return result.article;
}

function ebookImportWorkerUrl() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return new URL(
    basename(currentDir) === 'chunks' ? '../ebook-import-worker.js' : './ebook-import-worker.js',
    import.meta.url,
  );
}
