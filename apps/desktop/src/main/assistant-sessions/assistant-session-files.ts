import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_SUFFIX = '.sqlite';
const TEXT_SUFFIX = '.text.json';

export function sessionFilePath(directory: string, articleId: string) {
  return join(directory, `${safeArticleId(articleId)}${FILE_SUFFIX}`);
}

export function articleTextFilePath(directory: string, articleId: string) {
  return join(directory, `${safeArticleId(articleId)}${TEXT_SUFFIX}`);
}

function safeArticleId(articleId: string) {
  const safeId = articleId.replace(/[^a-z0-9_-]/gi, '');
  if (!safeId) throw new Error('ASSISTANT_SESSION_INVALID_ID');
  return safeId;
}

export function sessionArticleId(fileName: string) {
  return fileName.endsWith(FILE_SUFFIX) ? fileName.slice(0, -FILE_SUFFIX.length) : undefined;
}

export async function removeSessionFiles(path: string) {
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${path}${suffix}`, { force: true })));
}

export async function removeArticleFiles(directory: string, articleId: string) {
  await Promise.all([
    removeSessionFiles(sessionFilePath(directory, articleId)),
    rm(articleTextFilePath(directory, articleId), { force: true }),
  ]);
}
