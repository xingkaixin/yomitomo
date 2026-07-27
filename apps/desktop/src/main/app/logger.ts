import { constants } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { isRecord, recordField } from '@yomitomo/shared';

const LOG_FILE_NAME = 'yomitomo-agent.log';
const LEGACY_LOG_FILE_NAME = 'reader-agent.log';
const MAX_LOG_DEPTH = 8;
const MAX_LOG_ITEMS = 100;
const MAX_LOG_STRING_LENGTH = 10_000;

export function logInfo(event: string, data?: Record<string, unknown>) {
  dispatchLog('info', event, data);
}

export function logError(event: string, error: unknown, data?: Record<string, unknown>) {
  dispatchLog('error', event, data, error);
}

export function getLogPath() {
  return join(app.getPath('userData'), LOG_FILE_NAME);
}

export async function readLogFile() {
  await ensureLogFile();
  return readFile(getLogPath(), 'utf8');
}

export async function clearLogFile() {
  await ensureLogFile();
  await writeFile(getLogPath(), '', 'utf8');
}

export async function pruneLogFile(retentionDays?: number) {
  if (!retentionDays) return;

  await ensureLogFile();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const lines = (await readFile(getLogPath(), 'utf8')).split('\n');
  const retained = lines.filter((line) => {
    if (!line.trim()) return false;

    const time = logLineTime(line);
    return time === null || time >= cutoff;
  });
  await writeFile(getLogPath(), retained.length > 0 ? `${retained.join('\n')}\n` : '', 'utf8');
}

function legacyLogPath() {
  return join(app.getPath('appData'), '@reader', 'desktop', LEGACY_LOG_FILE_NAME);
}

function dispatchLog(
  level: 'info' | 'error',
  event: string,
  data?: Record<string, unknown>,
  error?: unknown,
) {
  void writeLog(level, event, data, error).catch((writeError) => {
    fallbackLogWriteFailure(level, event, writeError);
  });
}

async function writeLog(
  level: 'info' | 'error',
  event: string,
  data?: Record<string, unknown>,
  error?: unknown,
) {
  const serializedData = serializeLogData(data, error);
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    event,
    data: serializedData,
  });

  console[level === 'error' ? 'error' : 'log']('[Yomitomo]', event, serializedData || '');
  await ensureLogFile();
  await appendFile(getLogPath(), `${line}\n`, 'utf8');
}

function serializeLogData(data?: Record<string, unknown>, error?: unknown) {
  const serialized = sanitizeLogValue(data, 0, new WeakSet());
  if (error === undefined) return serialized;
  const record = isRecord(serialized) ? serialized : {};
  return {
    ...record,
    error: sanitizeLogValue(error, 0, new WeakSet()),
  };
}

function sanitizeLogValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return truncateLogString(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    value === undefined
  ) {
    return value;
  }
  if (typeof value === 'symbol')
    return value.description ? `[Symbol ${value.description}]` : '[Symbol]';
  if (typeof value === 'function') return value.name ? `[Function ${value.name}]` : '[Function]';
  if (typeof value !== 'object') return '[Unsupported]';
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_LOG_DEPTH) return '[MaxDepth]';

  seen.add(value);
  try {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: truncateLogString(value.message),
        stack: value.stack ? truncateLogString(value.stack) : undefined,
        cause: sanitizeLogValue(value.cause, depth + 1, seen),
      };
    }
    if (Array.isArray(value)) {
      return value.slice(0, MAX_LOG_ITEMS).map((item) => sanitizeLogValue(item, depth + 1, seen));
    }

    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, MAX_LOG_ITEMS)) {
      try {
        output[key] = sanitizeLogValue((value as Record<string, unknown>)[key], depth + 1, seen);
      } catch {
        output[key] = '[Unserializable]';
      }
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function truncateLogString(value: string) {
  return value.length > MAX_LOG_STRING_LENGTH
    ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}[Truncated]`
    : value;
}

function fallbackLogWriteFailure(level: 'info' | 'error', event: string, error: unknown) {
  try {
    console.error('[Yomitomo] logger.write_failed', {
      level,
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  } catch {
    return;
  }
}

async function ensureLogFile() {
  await mkdir(dirname(getLogPath()), { recursive: true });
  await copyFile(legacyLogPath(), getLogPath(), constants.COPYFILE_EXCL).catch(() => undefined);
  await appendFile(getLogPath(), '', 'utf8');
}

function logLineTime(line: string) {
  try {
    const parsed = JSON.parse(line) as unknown;
    const at = recordField(parsed, 'at');
    if (typeof at !== 'string') return null;
    const time = new Date(at).getTime();
    return Number.isNaN(time) ? null : time;
  } catch {
    return null;
  }
}
