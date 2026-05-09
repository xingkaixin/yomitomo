export type AiLogger = {
  info?: (event: string, data?: Record<string, unknown>) => void;
  error?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

let logger: AiLogger = {};

export function setAiLogger(nextLogger: AiLogger) {
  logger = nextLogger;
}

export function logAiInfo(event: string, data?: Record<string, unknown>) {
  logger.info?.(event, data);
}

export function logAiError(event: string, error: unknown, data?: Record<string, unknown>) {
  logger.error?.(event, error, data);
}
