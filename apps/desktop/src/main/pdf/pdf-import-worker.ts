import { parentPort, workerData } from 'node:worker_threads';
import { isSourceImportError } from '../../ipc/article-import-boundary';
import {
  createPdfImportRuntime,
  type PdfWorkerInitData,
  type PdfWorkerRequest,
  type PdfWorkerResponse,
} from './pdf-import-engine';

if (parentPort) {
  const port = parentPort;
  const initData = (workerData ?? {}) as PdfWorkerInitData;
  const runtime = createPdfImportRuntime({ wasmPath: initData.wasmPath });

  port.on('message', (request: PdfWorkerRequest) => {
    void handleRequest(request).then((outcome) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      port.postMessage(outcome.response, outcome.transferList);
    });
  });

  async function handleRequest(request: PdfWorkerRequest): Promise<{
    response: PdfWorkerResponse;
    transferList: ArrayBuffer[];
  }> {
    try {
      if (request.kind === 'import') {
        const { article, thumbnailBitmap } = await runtime.extractArticle(request.input);
        return {
          response: {
            id: request.id,
            ok: true,
            kind: 'import',
            article,
            thumbnailBitmap,
          },
          transferList: thumbnailBitmap ? [thumbnailBitmap.bitmap] : [],
        };
      }
      const thumbnailBitmap = await runtime.renderThumbnailBitmap(request.data);
      return {
        response: {
          id: request.id,
          ok: true,
          kind: 'thumbnail',
          thumbnailBitmap,
        },
        transferList: thumbnailBitmap ? [thumbnailBitmap.bitmap] : [],
      };
    } catch (error: unknown) {
      return {
        response: {
          id: request.id,
          ok: false,
          errorCode: isSourceImportError(error) ? error.importCode : undefined,
          message: error instanceof Error && error.message ? error.message : 'PDF_WORKER_FAILED',
        },
        transferList: [],
      };
    }
  }
}
