import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanupE2eData,
  cleanupE2ePath,
  createE2eDesktopEnv,
  createE2eRunData,
  createTextFixture,
  createTinyEpubFixture,
  createTinyPdfFixture,
} from '../../helpers/e2e-data';

describe('desktop E2E data helpers', () => {
  it('creates isolated user data and fixture directories', async () => {
    const data = await createE2eRunData('data-helper');
    try {
      expect((await stat(data.userDataDir)).isDirectory()).toBe(true);
      expect((await stat(data.fixtureDir)).isDirectory()).toBe(true);

      const env = createE2eDesktopEnv(data, { PATH: '/bin' });
      expect(env).toMatchObject({
        ELECTRON_ENABLE_LOGGING: '1',
        PATH: '/bin',
        YOMITOMO_DISABLE_TELEMETRY: '1',
        YOMITOMO_E2E: '1',
        YOMITOMO_USER_DATA_DIR: data.userDataDir,
      });

      const text = await createTextFixture(data.fixtureDir, {
        content: 'fixture text',
        fileName: 'note.txt',
      });
      const epub = await createTinyEpubFixture(data.fixtureDir, {
        fileName: 'book.epub',
        title: 'Fixture Book',
      });
      const pdf = await createTinyPdfFixture(data.fixtureDir, { fileName: 'paper.pdf' });

      expect(text.path).toBe(join(data.fixtureDir, 'note.txt'));
      expect(await readFile(text.path, 'utf8')).toBe('fixture text');
      expect(epub.data.byteLength).toBeGreaterThan(0);
      expect(pdf.data.toString('utf8')).toContain('%PDF-1.4');
      await expect(createTextFixture(data.fixtureDir, { fileName: '../leak.txt' })).rejects.toThrow(
        'Invalid E2E fixture file name',
      );
    } finally {
      await cleanupE2eData(data, { keep: false });
    }

    await expect(stat(data.rootDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps data and logs paths when requested', async () => {
    const data = await createE2eRunData('keep-data');
    const messages: string[] = [];
    try {
      await cleanupE2eData(data, {
        keep: true,
        log: (message) => messages.push(message),
      });

      expect(messages).toEqual([
        `YOMITOMO_E2E_ROOT_DIR=${data.rootDir}`,
        `YOMITOMO_E2E_USER_DATA_DIR=${data.userDataDir}`,
        `YOMITOMO_E2E_FIXTURE_DIR=${data.fixtureDir}`,
      ]);
      expect((await stat(data.rootDir)).isDirectory()).toBe(true);
    } finally {
      await cleanupE2ePath(data.rootDir);
    }
  });
});
