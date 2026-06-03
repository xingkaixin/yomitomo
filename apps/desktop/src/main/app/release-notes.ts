import { readFile } from 'node:fs/promises';
import { app } from 'electron';
import type { ReleaseNoteHighlight, UserFacingReleaseNote } from '@yomitomo/shared';
import { mainPath } from './main-paths';
import { logError } from './logger';

export type ReleaseNoteSource = 'local' | 'remote';

const REMOTE_BASE = 'https://yomitomo.app/release-notes';
const HIGHLIGHT_TYPES = new Set<ReleaseNoteHighlight['type']>([
  'new',
  'changed',
  'deprecated',
  'fixed',
]);

// 统一入口：更新后弹窗读本地打包文案（local），更新前弹窗按目标版本远程拉官网文案（remote）。
// 任一来源缺失或解析失败都降级为 null，由调用方退回纯版本号提示，不阻塞更新流程。
export async function getReleaseNote(
  version: string,
  source: ReleaseNoteSource,
): Promise<UserFacingReleaseNote | null> {
  const safeVersion = sanitizeVersion(version);
  if (!safeVersion) return null;
  if (source === 'local') return getLocalReleaseNote(safeVersion);
  const remote = await fetchRemoteReleaseNote(safeVersion);
  if (remote || app.isPackaged) return remote;
  // 开发环境官网文案可能尚未部署，回退本地打包文案，便于验证更新前弹窗。
  return getLocalReleaseNote(safeVersion);
}

async function getLocalReleaseNote(version: string): Promise<UserFacingReleaseNote | null> {
  try {
    const raw = await readFile(mainPath(`../../resources/release-notes/${version}.json`), 'utf8');
    return parseReleaseNote(raw);
  } catch {
    return null;
  }
}

async function fetchRemoteReleaseNote(version: string): Promise<UserFacingReleaseNote | null> {
  try {
    const response = await fetch(`${REMOTE_BASE}/${version}.json`);
    if (!response.ok) return null;
    return parseReleaseNote(await response.text());
  } catch (error) {
    logError('release-notes.remote-failed', error, { version });
    return null;
  }
}

// 仅允许语义版本字符可进入文件名/URL，杜绝路径穿越。
function sanitizeVersion(version: string): string | null {
  return /^[\w.-]+$/.test(version) ? version : null;
}

function parseReleaseNote(raw: string): UserFacingReleaseNote | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || typeof data.version !== 'string' || !Array.isArray(data.highlights)) {
      return null;
    }
    return { version: data.version, highlights: data.highlights.filter(isHighlight) };
  } catch {
    return null;
  }
}

function isHighlight(value: unknown): value is ReleaseNoteHighlight {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.type === 'string' &&
    HIGHLIGHT_TYPES.has(value.type as ReleaseNoteHighlight['type'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
