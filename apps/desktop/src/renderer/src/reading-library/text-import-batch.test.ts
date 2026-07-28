import { describe, expect, it } from 'vitest';
import {
  MAX_TEXT_IMPORT_BATCH_BYTES,
  MAX_TEXT_IMPORT_BYTES,
  MAX_TEXT_IMPORT_FILES,
} from '../../../ipc/article-import-boundary';
import {
  acceptTextImportFiles,
  readTextImportFiles,
  textImportReadConcurrency,
} from './text-import-batch';

describe('acceptTextImportFiles', () => {
  it('keeps a selection that fits both the file count and the batch budget', () => {
    const files = Array.from({ length: MAX_TEXT_IMPORT_FILES }, () => ({ size: 1024 }));

    expect(acceptTextImportFiles(files)).toHaveLength(MAX_TEXT_IMPORT_FILES);
  });

  it('stops at the file count even when the batch is tiny', () => {
    const files = Array.from({ length: MAX_TEXT_IMPORT_FILES + 10 }, () => ({ size: 1 }));

    expect(acceptTextImportFiles(files)).toHaveLength(MAX_TEXT_IMPORT_FILES);
  });

  it('stops at the batch budget even when the file count is low', () => {
    const files = Array.from({ length: 8 }, () => ({ size: MAX_TEXT_IMPORT_BYTES }));

    const accepted = acceptTextImportFiles(files);

    expect(accepted).toHaveLength(Math.floor(MAX_TEXT_IMPORT_BATCH_BYTES / MAX_TEXT_IMPORT_BYTES));
  });

  it('accepts a selection that fills the batch budget exactly', () => {
    const files = [{ size: MAX_TEXT_IMPORT_BATCH_BYTES }];

    expect(acceptTextImportFiles(files)).toHaveLength(1);
    expect(acceptTextImportFiles([{ size: MAX_TEXT_IMPORT_BATCH_BYTES + 1 }])).toHaveLength(0);
  });
});

describe('readTextImportFiles', () => {
  it('never reads more files at once than the configured concurrency', async () => {
    let reading = 0;
    let peakReading = 0;
    const files = Array.from({ length: 12 }, (_, index) => ({
      name: `note-${index}.txt`,
      size: 8,
      arrayBuffer: async () => {
        reading += 1;
        peakReading = Math.max(peakReading, reading);
        await Promise.resolve();
        reading -= 1;
        return new ArrayBuffer(8);
      },
    }));

    const payload = await readTextImportFiles(files);

    expect(payload.map((entry) => entry.fileName)).toEqual(files.map((file) => file.name));
    expect(peakReading).toBeLessThanOrEqual(textImportReadConcurrency);
  });
});
