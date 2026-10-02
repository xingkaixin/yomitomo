import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paths = vi.hoisted(() => ({ root: '', userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => paths.userData } }));
vi.mock('./app/logger', () => ({ logInfo: vi.fn() }));
vi.mock('./native/sqlite', () => ({ loadSQLiteDatabase: () => SQLiteDatabase }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
import { createFullBackup, restoreFullBackup } from './full-backup';
import {
  closeDatabase,
  getSqliteExecutor,
  readDatabaseLifecycle,
  withDatabaseLease,
} from './store/store-db';
const actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

beforeEach(async () => {
  closeDatabase();
  vi.mocked(rename).mockImplementation(actualFs.rename);
  paths.root = await mkdtemp(join(tmpdir(), 'yomitomo-full-backup-'));
  paths.userData = join(paths.root, 'device-one');
  await mkdir(paths.userData);
  await seedLibrary('original');
});
afterEach(async () => {
  closeDatabase();
  await rm(paths.root, { recursive: true, force: true });
});

describe('complete backup and migration', () => {
  it('moves the library and originals to another profile without machine credentials', async () => {
    const current = getSqliteExecutor();
    current.exec(
      `UPDATE app_settings SET app_lock_enabled = 1, app_lock_locked = 1, app_lock_lock_on_startup = 1`,
    );
    current.exec(
      `INSERT INTO providers (id, name, type, base_url, api_key, api_key_ref, model_name, created_at, updated_at) VALUES ('p1', 'Provider', 'openai', 'https://example.invalid', 'legacy-secret', 'keyring-ref', 'model', 'now', 'now')`,
    );
    current.exec(`INSERT INTO secret_deletion_tasks VALUES ('pending-key', 'now')`);
    const backup = await createFullBackup(paths.root);
    expect(current.prepare('SELECT api_key FROM providers').get()).toEqual({
      api_key: 'legacy-secret',
    });
    closeDatabase();
    paths.userData = join(paths.root, 'device-two');
    await mkdir(paths.userData);
    await seedLibrary('recipient');
    const previous = await restoreFullBackup(backup);
    expect(readTitle()).toBe('original');
    for (const file of ['ebooks/book.epub', 'pdf/paper.pdf', 'assets/pdf-thumbs/paper.jpg']) {
      expect(await readFile(join(paths.userData, file), 'utf8')).toBe(`original:${file}`);
      expect(await readFile(join(previous, file), 'utf8')).toBe(`recipient:${file}`);
    }
    expect(getSqliteExecutor().prepare('SELECT api_key, api_key_ref FROM providers').get()).toEqual(
      { api_key: '', api_key_ref: null },
    );
    expect(
      getSqliteExecutor()
        .prepare(
          'SELECT app_lock_enabled, app_lock_locked, app_lock_lock_on_startup FROM app_settings',
        )
        .get(),
    ).toEqual({ app_lock_enabled: 0, app_lock_locked: 0, app_lock_lock_on_startup: 0 });
    expect(getSqliteExecutor().prepare('SELECT * FROM secret_deletion_tasks').all()).toEqual([]);
    expect(
      (await readFile(join(backup, 'yomitomo.sqlite'))).includes(Buffer.from('legacy-secret')),
    ).toBe(false);
    await restoreFullBackup(previous);
    expect(readTitle()).toBe('recipient');
  });

  it.each(['ebooks/book.epub', 'yomitomo.sqlite'])(
    'rejects changed %s before replacing current data',
    async (file) => {
      const backup = await createFullBackup(paths.root);
      await writeFile(join(backup, file), 'damaged');
      await seedLibrary('current');
      await expect(restoreFullBackup(backup)).rejects.toThrow(
        'DATA_MANAGEMENT_BACKUP_CHECKSUM_FAILED',
      );
      expect(readTitle()).toBe('current');
      expect(await readFile(join(paths.userData, 'ebooks/book.epub'), 'utf8')).toBe(
        'current:ebooks/book.epub',
      );
    },
  );

  it('rejects traversal and symlink sources', async () => {
    const backup = await createFullBackup(paths.root);
    const manifestPath = join(backup, 'manifest.json');
    const original = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(original);
    manifest.files[0].path = '../yomitomo.sqlite';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(restoreFullBackup(backup)).rejects.toThrow('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
    await writeFile(manifestPath, original);
    await rm(join(backup, 'ebooks/book.epub'));
    await symlink(join(paths.userData, 'ebooks/book.epub'), join(backup, 'ebooks/book.epub'));
    await expect(restoreFullBackup(backup)).rejects.toThrow('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
    expect(readTitle()).toBe('original');
  });

  it.each(['asset', 'database'])(
    'rolls back both originals and records when %s replacement fails',
    async (failure) => {
      const backup = await createFullBackup(paths.root);
      await seedLibrary('current');
      vi.mocked(rename).mockImplementation(async (from, to) => {
        if (failure === 'asset' && String(to) === join(paths.userData, 'pdf'))
          throw new Error('asset install failed');
        if (failure === 'database' && String(from).includes('yomitomo.sqlite.restore-'))
          throw new Error('database install failed');
        return actualFs.rename(from, to);
      });
      await expect(restoreFullBackup(backup)).rejects.toThrow(`${failure} install failed`);
      expect(readTitle()).toBe('current');
      for (const file of ['ebooks/book.epub', 'pdf/paper.pdf', 'assets/pdf-thumbs/paper.jpg']) {
        expect(await readFile(join(paths.userData, file), 'utf8')).toBe(`current:${file}`);
      }
      expect(readDatabaseLifecycle().state).toBe('open');
    },
  );

  it('waits for an active write before taking the database and asset snapshot', async () => {
    let complete!: () => void;
    const ready = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const write = withDatabaseLease(async () => {
      await ready;
      await seedLibrary('completed');
    });
    const backup = createFullBackup(paths.root);
    await expect(withDatabaseLease(async () => undefined)).rejects.toThrow(
      'DATA_MANAGEMENT_DATABASE_REPLACING',
    );
    complete();
    await write;
    const saved = await backup;
    expect(await readFile(join(saved, 'ebooks/book.epub'), 'utf8')).toBe(
      'completed:ebooks/book.epub',
    );
    const db = new SQLiteDatabase(join(saved, 'yomitomo.sqlite'), { readonly: true });
    try {
      expect(db.prepare('SELECT title FROM articles').get()).toEqual({ title: 'completed' });
    } finally {
      db.close();
    }
  });

  it('rejects exporting inside the application data directory', async () => {
    await expect(createFullBackup(paths.userData)).rejects.toThrow(
      'DATA_MANAGEMENT_BACKUP_INSIDE_DATA_DIRECTORY',
    );
  });
});

function readTitle() {
  return getSqliteExecutor().prepare('SELECT title FROM articles').pluck().get();
}

async function seedLibrary(title: string) {
  const db = getSqliteExecutor();
  db.prepare(
    `INSERT INTO articles (id, url, canonical_url, source_type, title, content_hash, created_at, updated_at) VALUES ('book', 'file:book.epub', 'file:book.epub', 'ebook', ?, 'hash', 'now', 'now') ON CONFLICT(id) DO UPDATE SET title = excluded.title`,
  ).run(title);
  for (const directory of ['ebooks', 'pdf', 'assets/pdf-thumbs'])
    await mkdir(join(paths.userData, directory), { recursive: true });
  for (const file of ['ebooks/book.epub', 'pdf/paper.pdf', 'assets/pdf-thumbs/paper.jpg'])
    await writeFile(join(paths.userData, file), `${title}:${file}`);
}
