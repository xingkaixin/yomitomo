import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_SUFFIX = '.sqlite';

export function sessionFilePath(directory: string, articleId: string) {
  const safeId = articleId.replace(/[^a-z0-9_-]/gi, '');
  if (!safeId) throw new Error('ASSISTANT_SESSION_INVALID_ID');
  return join(directory, `${safeId}${FILE_SUFFIX}`);
}

export function sessionArticleId(fileName: string) {
  return fileName.endsWith(FILE_SUFFIX) ? fileName.slice(0, -FILE_SUFFIX.length) : undefined;
}

export async function removeSessionFiles(path: string) {
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${path}${suffix}`, { force: true })));
}
