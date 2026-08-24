import { describe, expect, it } from 'vitest';
import {
  DesktopIpcError,
  desktopIpcErrorCodes,
  isDesktopIpcErrorLike,
  serializeDesktopIpcError,
} from './ipc-errors';

describe('desktop IPC errors', () => {
  it('accepts only declared error codes', () => {
    expect(new DesktopIpcError(desktopIpcErrorCodes.appLockRequired)).toSatisfy(
      isDesktopIpcErrorLike,
    );
    expect(new DesktopIpcError('ARTICLE_IMPORT_REQUEST_FAILED')).toSatisfy(isDesktopIpcErrorLike);
    expect({ code: 'UNDECLARED_ERROR', message: 'failed' }).not.toSatisfy(isDesktopIpcErrorLike);
  });

  it('serializes generic errors with the handler failure code', () => {
    expect(serializeDesktopIpcError(new Error('ARTICLE_IMPORT_REQUEST_FAILED'))).toEqual({
      code: desktopIpcErrorCodes.handlerFailed,
      message: 'ARTICLE_IMPORT_REQUEST_FAILED',
    });
  });
});
