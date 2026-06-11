export const desktopIpcErrorCodes = {
  agentNotFound: 'AGENT_NOT_FOUND',
  annotationAgentNotFound: 'ANNOTATION_AGENT_NOT_FOUND',
  handlerFailed: 'IPC_HANDLER_FAILED',
  invalidArgs: 'IPC_INVALID_ARGS',
  providerRouteRequired: 'PROVIDER_ROUTE_REQUIRED',
  reviewAgentNotFound: 'REVIEW_AGENT_NOT_FOUND',
} as const;

export type DesktopIpcErrorCode =
  | (typeof desktopIpcErrorCodes)[keyof typeof desktopIpcErrorCodes]
  | (string & {});

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
    message = code,
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
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
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
