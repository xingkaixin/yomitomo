import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { logInfo } from './app/logger';
import { validateDatabaseBackupFile } from './db/backup-validation';
import { loadSQLiteDatabase } from './native/sqlite';
import {
  backupDatabaseFile,
  getDataDirectoryPath,
  replaceDatabaseFile,
  withDatabaseMaintenance,
} from './store/store-db';

const databaseName = 'yomitomo.sqlite';
const assetDirectories = ['ebooks', 'pdf', 'assets/pdf-thumbs'] as const;
const manifestName = 'manifest.json';
const assetPathPattern =
  /^(?:ebooks\/[A-Za-z0-9_-]+\.(?:epub|mobi|azw3)|pdf\/[A-Za-z0-9_-]+\.pdf|assets\/pdf-thumbs\/[A-Za-z0-9_-]+\.jpg)$/;
const manifestSchema = z.object({
  format: z.literal('yomitomo-backup'),
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  files: z.array(
    z.object({
      path: z.string().refine((path) => path === databaseName || assetPathPattern.test(path)),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

export async function createFullBackup(parentDirectory: string) {
  const parent = resolve(parentDirectory);
  const dataRoot = resolve(getDataDirectoryPath());
  const fromData = relative(dataRoot, parent);
  if (
    !fromData ||
    (!isAbsolute(fromData) && !fromData.startsWith(`..${sep}`) && fromData !== '..')
  ) {
    throw new Error('DATA_MANAGEMENT_BACKUP_INSIDE_DATA_DIRECTORY');
  }
  const target = join(parent, backupDirectoryName());
  return withDatabaseMaintenance(() => writeFullBackup(target));
}

export async function restoreFullBackup(sourceDirectory: string) {
  const dataRoot = getDataDirectoryPath();
  const backupRoot = join(dataRoot, 'backups');
  await mkdir(backupRoot, { recursive: true });
  const staged = await mkdtemp(join(backupRoot, '.restore-'));
  const safetyBackup = join(backupRoot, backupDirectoryName());
  const replacedDirectories: string[] = [];
  try {
    await stageVerifiedBackup(resolve(sourceDirectory), staged);
    sanitizePortableDatabase(join(staged, databaseName));
    await replaceDatabaseFile(join(staged, databaseName), {
      install: async () => {
        await writeFullBackup(safetyBackup);
        for (const directory of assetDirectories) {
          const target = join(dataRoot, directory);
          replacedDirectories.push(directory);
          await rm(target, { recursive: true, force: true });
          await mkdir(dirname(target), { recursive: true });
          await rename(join(staged, directory), target);
        }
      },
      rollback: async () => {
        const failures: unknown[] = [];
        for (const directory of replacedDirectories.toReversed()) {
          try {
            const target = join(dataRoot, directory);
            await rm(target, { recursive: true, force: true });
            await copyAssetDirectory(safetyBackup, dataRoot, directory);
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length)
          throw new AggregateError(failures, 'DATA_MANAGEMENT_RESTORE_ROLLBACK_FAILED');
      },
    });
    return safetyBackup;
  } finally {
    await rm(staged, { recursive: true, force: true }).catch((error) => {
      logInfo('store.full_restore_cleanup_failed', { error: String(error) });
    });
  }
}

async function writeFullBackup(target: string) {
  const temporary = `${target}.incomplete-${randomUUID()}`;
  await mkdir(temporary, { recursive: true });
  try {
    await backupDatabaseFile(join(temporary, databaseName));
    sanitizePortableDatabase(join(temporary, databaseName));
    const paths = [databaseName];
    for (const directory of assetDirectories) {
      paths.push(...(await copyAssetDirectory(getDataDirectoryPath(), temporary, directory)));
    }
    const files = [];
    for (const path of paths) {
      files.push({ path, sha256: await hashFile(join(temporary, path)) });
    }
    await writeFile(
      join(temporary, manifestName),
      JSON.stringify(
        {
          format: 'yomitomo-backup',
          version: 1,
          createdAt: new Date().toISOString(),
          files,
        },
        null,
        2,
      ),
    );
    await rename(temporary, target);
    return target;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function stageVerifiedBackup(source: string, staged: string) {
  await assertDirectory(source);
  await assertRegularFile(join(source, manifestName));
  const parsed = manifestSchema.safeParse(
    JSON.parse(await readFile(join(source, manifestName), 'utf8')),
  );
  if (!parsed.success) throw new Error('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
  const paths = parsed.data.files.map((file) => file.path);
  if (!paths.includes(databaseName) || new Set(paths).size !== paths.length) {
    throw new Error('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
  }
  for (const directory of assetDirectories) {
    await assertDirectory(join(source, directory));
    await mkdir(join(staged, directory), { recursive: true });
  }
  await assertDirectory(join(source, 'assets'));
  for (const file of parsed.data.files) {
    const from = join(source, file.path);
    await assertRegularFile(from);
    const target = join(staged, file.path);
    await copyFile(from, target);
    if ((await hashFile(target)) !== file.sha256) {
      throw new Error('DATA_MANAGEMENT_BACKUP_CHECKSUM_FAILED');
    }
  }
  validateDatabaseBackupFile(join(staged, databaseName));
}

async function copyAssetDirectory(source: string, target: string, directory: string) {
  const from = join(source, directory);
  const to = join(target, directory);
  await mkdir(to, { recursive: true });
  const info = await lstat(from).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!info) return [];
  if (!info.isDirectory()) throw new Error('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
  if (directory.startsWith('assets/')) await assertDirectory(join(source, 'assets'));
  const copied = [];
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (!assetPathPattern.test(path)) continue;
    if (!entry.isFile()) throw new Error('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
    await copyFile(join(from, entry.name), join(to, entry.name));
    copied.push(path);
  }
  return copied;
}

function sanitizePortableDatabase(path: string) {
  const SQLiteDatabase = loadSQLiteDatabase();
  const database = new SQLiteDatabase(path, { fileMustExist: true });
  try {
    database.pragma('secure_delete = ON');
    database.transaction(() => {
      database.exec("UPDATE providers SET api_key = '', api_key_ref = NULL");
      database.exec('UPDATE weread_accounts SET api_key_ref = NULL');
      database.exec('DELETE FROM secret_deletion_tasks');
      database.exec(
        'UPDATE app_settings SET app_lock_enabled = 0, app_lock_locked = 0, app_lock_lock_on_startup = 0',
      );
    })();
    database.exec('VACUUM');
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

async function assertDirectory(path: string) {
  if (!(await lstat(path)).isDirectory()) throw new Error('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
}

async function assertRegularFile(path: string) {
  if (!(await lstat(path)).isFile()) throw new Error('DATA_MANAGEMENT_INVALID_FULL_BACKUP');
}

async function hashFile(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function backupDirectoryName() {
  return `yomitomo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}
