import {
  MAX_TEXT_IMPORT_BATCH_BYTES,
  MAX_TEXT_IMPORT_FILES,
} from '../../../ipc/article-import-boundary';

type TextImportFile = {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

// Reading a couple of files at a time keeps the batch from materializing every decoded
// ArrayBuffer before the first one is handed to main.
const TEXT_IMPORT_READ_CONCURRENCY = 2;

/** Takes the longest prefix of the selection that fits both batch facts: file count and total bytes. */
export function acceptTextImportFiles<File extends { size: number }>(files: File[]) {
  const accepted: File[] = [];
  let batchBytes = 0;
  for (const file of files) {
    if (accepted.length >= MAX_TEXT_IMPORT_FILES) break;
    if (batchBytes + file.size > MAX_TEXT_IMPORT_BATCH_BYTES) break;
    batchBytes += file.size;
    accepted.push(file);
  }
  return accepted;
}

export async function readTextImportFiles(files: TextImportFile[]) {
  const payload: { fileName: string; data: ArrayBuffer }[] = [];
  for (let start = 0; start < files.length; start += TEXT_IMPORT_READ_CONCURRENCY) {
    const batch = files.slice(start, start + TEXT_IMPORT_READ_CONCURRENCY);
    payload.push(
      ...(await Promise.all(
        batch.map(async (file) => ({ fileName: file.name, data: await file.arrayBuffer() })),
      )),
    );
  }
  return payload;
}

export const textImportReadConcurrency = TEXT_IMPORT_READ_CONCURRENCY;
