import type { DesktopStore } from '@yomitomo/shared';

export type DesktopStoreLoadErrorCode = 'DATABASE_TOO_NEW' | 'DATABASE_UNAVAILABLE';

export type DesktopStoreLoadErrorInfo = {
  code: DesktopStoreLoadErrorCode;
  message: string;
  detail?: string;
  requiredReaderLevel?: number;
  supportedReaderLevel?: number;
  logPath?: string;
};

export type DesktopStoreGetResult =
  | { ok: true; store: DesktopStore }
  | { ok: false; error: DesktopStoreLoadErrorInfo };

export class DesktopStoreLoadError extends Error {
  readonly code: DesktopStoreLoadErrorCode;
  readonly info: DesktopStoreLoadErrorInfo;

  constructor(info: DesktopStoreLoadErrorInfo) {
    super(info.message);
    this.name = 'DesktopStoreLoadError';
    this.code = info.code;
    this.info = info;
  }
}

export function desktopStoreLoadErrorInfo(error: unknown): DesktopStoreLoadErrorInfo | null {
  if (!error || typeof error !== 'object') return null;
  const info = (error as { info?: unknown }).info;
  if (isDesktopStoreLoadErrorInfo(info)) return info;

  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  if (
    (code === 'DATABASE_TOO_NEW' || code === 'DATABASE_UNAVAILABLE') &&
    typeof message === 'string'
  ) {
    return { code, message };
  }

  return null;
}

function isDesktopStoreLoadErrorInfo(value: unknown): value is DesktopStoreLoadErrorInfo {
  if (!value || typeof value !== 'object') return false;
  const code = (value as { code?: unknown }).code;
  const message = (value as { message?: unknown }).message;
  return (
    (code === 'DATABASE_TOO_NEW' || code === 'DATABASE_UNAVAILABLE') && typeof message === 'string'
  );
}
