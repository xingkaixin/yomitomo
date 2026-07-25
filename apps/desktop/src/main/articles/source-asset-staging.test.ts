import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renameState = vi.hoisted(() => ({
  callCount: 0,
  failAt: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      renameState.callCount += 1;
      if (renameState.callCount === renameState.failAt) {
        throw new Error('injected rename failure');
      }
      return actual.rename(...args);
    },
  };
});

import { stageSourceAssets } from './source-asset-staging';

let directory = '';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'yomitomo-source-assets-'));
  renameState.callCount = 0;
  renameState.failAt = 0;
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

describe('source asset staging', () => {
  it('installs all staged assets and removes backups after finalize', async () => {
    const sourcePath = join(directory, 'article.pdf');
    const thumbnailPath = join(directory, 'article.jpg');
    writeFileSync(sourcePath, 'old-source');
    writeFileSync(thumbnailPath, 'old-thumbnail');
    const staged = await stageSourceAssets([
      { data: Buffer.from('new-source'), targetPath: sourcePath },
      { data: Buffer.from('new-thumbnail'), targetPath: thumbnailPath },
    ]);

    await staged.commit();
    await staged.finalize();

    expect(readFileSync(sourcePath, 'utf8')).toBe('new-source');
    expect(readFileSync(thumbnailPath, 'utf8')).toBe('new-thumbnail');
  });

  it('restores every old asset when a later rename fails', async () => {
    const sourcePath = join(directory, 'article.pdf');
    const thumbnailPath = join(directory, 'article.jpg');
    writeFileSync(sourcePath, 'old-source');
    writeFileSync(thumbnailPath, 'old-thumbnail');
    const staged = await stageSourceAssets([
      { data: Buffer.from('new-source'), targetPath: sourcePath },
      { data: Buffer.from('new-thumbnail'), targetPath: thumbnailPath },
    ]);
    renameState.failAt = 4;

    await expect(staged.commit()).rejects.toThrow('injected rename failure');
    await staged.abort();

    expect(readFileSync(sourcePath, 'utf8')).toBe('old-source');
    expect(readFileSync(thumbnailPath, 'utf8')).toBe('old-thumbnail');
  });
});
