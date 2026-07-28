import { readFile } from 'node:fs/promises';
import { app } from 'electron';
import {
  isRecord,
  normalizeUiLanguage,
  type ReleaseNoteHighlight,
  type UiLanguage,
  type UserFacingReleaseNote,
} from '@yomitomo/shared';
import { mainPath } from './main-paths';
import { logError } from './logger';

export type ReleaseNoteSource = 'local' | 'remote';

const REMOTE_BASE = 'https://yomitomo.app/release-notes';
// Remote copy is optional decoration for a required decision, so it gets a short
// deadline and a small budget rather than however long the endpoint wants.
const REMOTE_RELEASE_NOTE_TIMEOUT_MS = 5_000;
const REMOTE_RELEASE_NOTE_MAX_BYTES = 256 * 1024;
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
  language: unknown = 'zh-CN',
): Promise<UserFacingReleaseNote | null> {
  const safeVersion = sanitizeVersion(version);
  const locale = normalizeUiLanguage(language);
  if (!safeVersion) return null;
  if (source === 'local') return getLocalReleaseNote(safeVersion, locale);
  const remote = await fetchRemoteReleaseNote(safeVersion, locale);
  if (remote || app.isPackaged) return remote;
  // 开发环境官网文案可能尚未部署，回退本地打包文案，便于验证更新前弹窗。
  return getLocalReleaseNote(safeVersion, locale);
}

async function getLocalReleaseNote(
  version: string,
  locale: UiLanguage,
): Promise<UserFacingReleaseNote | null> {
  const localized = await readLocalReleaseNote(
    `../../resources/release-notes/${locale}/${version}.json`,
  );
  if (localized) return localized;
  if (locale !== 'zh-CN') {
    const zh = await readLocalReleaseNote(`../../resources/release-notes/zh-CN/${version}.json`);
    if (zh) return zh;
  }
  return null;
}

async function readLocalReleaseNote(path: string): Promise<UserFacingReleaseNote | null> {
  try {
    const raw = await readFile(mainPath(path), 'utf8');
    return parseReleaseNote(raw);
  } catch {
    return null;
  }
}

async function fetchRemoteReleaseNote(
  version: string,
  locale: UiLanguage,
): Promise<UserFacingReleaseNote | null> {
  const localized = await readRemoteReleaseNote(
    `${REMOTE_BASE}/${locale}/${version}.json`,
    version,
  );
  if (localized) return localized;
  if (locale !== 'zh-CN') {
    const zh = await readRemoteReleaseNote(`${REMOTE_BASE}/zh-CN/${version}.json`, version);
    if (zh) return zh;
  }
  return null;
}

async function readRemoteReleaseNote(
  url: string,
  version: string,
): Promise<UserFacingReleaseNote | null> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REMOTE_RELEASE_NOTE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > REMOTE_RELEASE_NOTE_MAX_BYTES) {
      await response.body?.cancel();
      return null;
    }
    return parseReleaseNote(await readBoundedText(response));
  } catch (error) {
    logError('release-notes.remote-failed', error, {
      url,
      version,
      durationMs: Date.now() - startedAt,
      errorKind: error instanceof Error ? error.name : 'unknown',
    });
    return null;
  }
}

async function readBoundedText(response: Response) {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > REMOTE_RELEASE_NOTE_MAX_BYTES) {
      await reader.cancel();
      throw new Error('RELEASE_NOTE_RESPONSE_TOO_LARGE');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
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
