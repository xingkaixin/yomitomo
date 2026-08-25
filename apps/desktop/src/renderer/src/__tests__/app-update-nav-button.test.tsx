// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdateState } from '../../../app-update-types';
import { initializeAppI18n } from '../i18n/app-i18n';
import { AppUpdateNavButton } from '../shell/app-update-nav-button';

beforeEach(() => initializeAppI18n('zh-CN'));
afterEach(cleanup);

describe('AppUpdateNavButton', () => {
  it('renders background download progress without speed or size details', () => {
    const onClick = vi.fn();
    const state: AppUpdateState = {
      status: 'downloading',
      currentVersion: '0.13.0',
      availableVersion: '0.14.0',
      progress: {
        percent: 52.6,
        transferred: 78_900_000,
        total: 150_000_000,
        bytesPerSecond: 10_000_000,
      },
    };

    render(<AppUpdateNavButton state={state} onClick={onClick} />);

    const button = screen.getByRole('button', {
      name: '正在后台下载更新，已完成 53%，点击查看详情',
    });
    expect(button.textContent).toBe('下载中 53%');
    expect(button.textContent).not.toContain('MB');
    expect(button.style.getPropertyValue('--app-nav-update-progress')).toBe('0.53');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the original entry before downloading and hides inactive states', () => {
    const { rerender } = render(
      <AppUpdateNavButton
        state={{ status: 'available', currentVersion: '0.13.0', availableVersion: '0.14.0' }}
        onClick={() => undefined}
      />,
    );

    expect(screen.getByText('有新版本')).toBeTruthy();

    rerender(
      <AppUpdateNavButton
        state={{ status: 'idle', currentVersion: '0.13.0' }}
        onClick={() => undefined}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
