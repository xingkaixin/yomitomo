import { sourceImportErrorCodes, type SourceImportErrorCode } from './ipc/article-import-boundary';

export const desktopIpcErrorCodes = {
  agentNotFound: 'AGENT_NOT_FOUND',
  annotationDistillationConflict: 'ANNOTATION_DISTILLATION_CONFLICT',
  annotationAgentNotFound: 'ANNOTATION_AGENT_NOT_FOUND',
  appLockPinInvalid: 'APP_LOCK_PIN_INVALID',
  appLockPinMismatch: 'APP_LOCK_PIN_MISMATCH',
  appLockPinRequired: 'APP_LOCK_PIN_REQUIRED',
  appLockRateLimited: 'APP_LOCK_RATE_LIMITED',
  appLockRequired: 'APP_LOCK_REQUIRED',
  appLockDisabled: 'APP_LOCK_DISABLED',
  appLockLockedStateRestricted: 'APP_LOCK_LOCKED_STATE_RESTRICTED',
  appLockUnlockRequired: 'APP_LOCK_UNLOCK_REQUIRED',
  handlerFailed: 'IPC_HANDLER_FAILED',
  invalidArgs: 'IPC_INVALID_ARGS',
  providerRouteRequired: 'PROVIDER_ROUTE_REQUIRED',
  providerApiKeyRequired: 'PROVIDER_API_KEY_REQUIRED',
  reviewAgentNotFound: 'REVIEW_AGENT_NOT_FOUND',
  senderNotAuthorized: 'IPC_SENDER_NOT_AUTHORIZED',
} as const;

export type DesktopIpcErrorCode =
  | (typeof desktopIpcErrorCodes)[keyof typeof desktopIpcErrorCodes]
  | SourceImportErrorCode;

const desktopIpcErrorCodeSet = new Set<string>([
  ...Object.values(desktopIpcErrorCodes),
  ...sourceImportErrorCodes,
]);

export type DesktopIpcErrorDetail = Record<string, unknown>;

export type SerializedDesktopIpcError = {
  code: DesktopIpcErrorCode;
  detail?: DesktopIpcErrorDetail;
  message: string;
};

export type DesktopIpcInvokeEnvelope<Result> =
  | { ok: true; value: Result }
  | { ok: false; error: SerializedDesktopIpcError };

export class DesktopIpcError extends Error {
  code: DesktopIpcErrorCode;
  detail?: DesktopIpcErrorDetail;

  constructor(
    code: DesktopIpcErrorCode,
    message: string = code,
    options: { cause?: unknown; detail?: DesktopIpcErrorDetail } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'DesktopIpcError';
    this.code = code;
    this.detail = options.detail;
  }
}

export function serializeDesktopIpcError(error: unknown): SerializedDesktopIpcError {
  if (isDesktopIpcErrorLike(error)) {
    return {
      code: error.code,
      detail: error.detail,
      message: error.message || error.code,
    };
  }
  return {
    code: desktopIpcErrorCodes.handlerFailed,
    message: error instanceof Error ? error.message : unknownErrorMessage(error),
  };
}

export function desktopIpcErrorFromSerialized(error: SerializedDesktopIpcError) {
  return new DesktopIpcError(error.code, error.message, { detail: error.detail });
}

export function isDesktopIpcErrorLike(error: unknown): error is SerializedDesktopIpcError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    isDesktopIpcErrorCode(error.code) &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export function isDesktopIpcErrorCode(value: unknown): value is DesktopIpcErrorCode {
  return typeof value === 'string' && desktopIpcErrorCodeSet.has(value);
}

export function desktopIpcErrorRetryAfterMs(error: unknown) {
  if (!isDesktopIpcErrorLike(error)) return undefined;
  const retryAfterMs = error.detail?.retryAfterMs;
  if (typeof retryAfterMs !== 'number' || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
    return undefined;
  }
  return Math.ceil(retryAfterMs);
}

function unknownErrorMessage(error: unknown) {
  if (!error) return desktopIpcErrorCodes.handlerFailed;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return desktopIpcErrorCodes.handlerFailed;
  }
}
