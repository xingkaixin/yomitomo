// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutSettings } from '../app-log-viewer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function installDesktopLogApi(rawLog: string) {
  const desktop = {
    getLogPath: vi.fn().mockResolvedValue('/tmp/yomitomo.log'),
    readLog: vi.fn().mockResolvedValue(rawLog),
    clearLog: vi.fn().mockResolvedValue(undefined),
  };

  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });

  return desktop;
}

describe('AboutSettings log viewer', () => {
  it('loads logs from the desktop bridge and filters by query', async () => {
    installDesktopLogApi(
      [
        '{"at":"2026-05-04T00:00:00.000Z","level":"info","event":"app.start","data":{"port":43891}}',
        '{"at":"2026-05-04T00:01:00.000Z","level":"error","event":"llm.fail","data":"timeout"}',
      ].join('\n'),
    );

    render(<AboutSettings />);

    expect(await screen.findByText('/tmp/yomitomo.log')).toBeTruthy();
    expect(screen.getByText('app.start')).toBeTruthy();
    expect(screen.getByText('llm.fail')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索日志事件、内容或路径'), {
      target: { value: 'llm' },
    });

    expect(screen.queryByText('app.start')).toBeNull();
    expect(screen.getByText('llm.fail')).toBeTruthy();
    expect(screen.getByText('1 / 2 条')).toBeTruthy();
  });

  it('clears loaded logs through the desktop bridge', async () => {
    const desktop = installDesktopLogApi(
      '{"at":"2026-05-04T00:00:00.000Z","level":"info","event":"app.start"}',
    );

    render(<AboutSettings />);

    await screen.findByText('app.start');
    fireEvent.click(screen.getByRole('button', { name: '清理' }));

    await waitFor(() => expect(desktop.clearLog).toHaveBeenCalledOnce());
    expect(screen.getByText('日志已清理')).toBeTruthy();
    expect(screen.getByText('没有匹配的日志')).toBeTruthy();
  });
});
