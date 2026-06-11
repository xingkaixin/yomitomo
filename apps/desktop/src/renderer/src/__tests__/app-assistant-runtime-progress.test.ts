import { beforeEach, describe, expect, it } from 'vitest';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../../ipc-errors';
import { initializeAppI18n } from '../i18n/app-i18n';
import { assistantRuntimeErrorMessage } from '../shell/app-assistant-runtime-progress';

describe('assistantRuntimeErrorMessage', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  it('formats structured IPC agent errors without parsing message suffixes', () => {
    expect(
      assistantRuntimeErrorMessage(
        new DesktopIpcError(
          desktopIpcErrorCodes.agentNotFound,
          desktopIpcErrorCodes.agentNotFound,
          {
            detail: { username: 'agent' },
          },
        ),
        'discussion.replyFailed',
      ),
    ).toBe('找不到助手@agent。');
  });

  it('formats structured IPC provider route errors from detail', () => {
    expect(
      assistantRuntimeErrorMessage(
        new DesktopIpcError(
          desktopIpcErrorCodes.providerRouteRequired,
          desktopIpcErrorCodes.providerRouteRequired,
          { detail: { task: 'readingAssistant' } },
        ),
        'discussion.replyFailed',
      ),
    ).toBe('请先在任务路由选择阅读理解助手供应商。');
  });
});
