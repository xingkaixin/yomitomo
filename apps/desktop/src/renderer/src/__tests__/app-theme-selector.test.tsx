// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultReaderBackgroundColor } from '@yomitomo/reader-ui/reader-settings';
import { ThemeSelector } from '../theme/app-theme-selector';
import {
  defaultThemeId,
  duskIndigoThemeId,
  inkPaperThemeId,
  shadLingoThemeId,
  type AppThemeId,
} from '../theme/app-theme';
import { initializeAppI18n } from '../i18n/app-i18n';

afterEach(cleanup);
beforeEach(() => initializeAppI18n('zh-CN'));

function props() {
  return {
    activeThemeId: defaultThemeId as AppThemeId,
    open: true,
    readerBackgroundColor: defaultReaderBackgroundColor,
    soundSettings: { soundEffectsEnabled: false },
    onOpenChange: vi.fn(),
    onSelectReaderBackground: vi.fn(),
    onSelectTheme: vi.fn(),
  };
}

describe('ThemeSelector', () => {
  it('shows library samples for visible themes and reading samples for light paper choices', () => {
    render(<ThemeSelector {...props()} />);
    expect(screen.getByRole('dialog', { name: '主题' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '青芽' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '米色纸' })).toBeNull();
    expect(screen.queryByRole('button', { name: '墨黑' })).toBeNull();
    expect(screen.getAllByTitle('阅读库')).toHaveLength(3);
    expect(screen.getAllByTitle('文章 / 电子书')).toHaveLength(5);
    expect(screen.getByRole('button', { name: '阅读器纸张：淡绿' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '阅读器纸张：松烟' })).toBeNull();
  });

  it('selects a theme immediately and keeps the picker open', () => {
    const callbacks = props();
    render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '青芽' }));
    expect(callbacks.onSelectTheme).toHaveBeenCalledExactlyOnceWith(shadLingoThemeId);
    expect(callbacks.onSelectReaderBackground).not.toHaveBeenCalled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
  });

  it('selects paper independently without saving an unchanged theme or paper', () => {
    const callbacks = props();
    render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '纸白' }));
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：纸白' }));
    expect(callbacks.onSelectTheme).not.toHaveBeenCalled();
    expect(callbacks.onSelectReaderBackground).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：淡绿' }));
    expect(callbacks.onSelectReaderBackground).toHaveBeenCalledExactlyOnceWith('#eef4e8');
    expect(callbacks.onSelectTheme).not.toHaveBeenCalled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
  });

  it('restores remembered theme and paper pairs when switching tone', () => {
    const callbacks = {
      ...props(),
      activeThemeId: inkPaperThemeId,
      readerBackgroundColor: '#eef4e8',
      readerBackgroundsByTone: { light: '#eef4e8', dark: '#171a21' },
      themeIdsByTone: { light: inkPaperThemeId, dark: duskIndigoThemeId },
    } satisfies Parameters<typeof ThemeSelector>[0];
    const { rerender } = render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    expect(callbacks.onSelectTheme).toHaveBeenCalledExactlyOnceWith(duskIndigoThemeId, '#171a21');
    expect(callbacks.onSelectReaderBackground).toHaveBeenCalledExactlyOnceWith('#171a21');
    rerender(
      <ThemeSelector
        {...callbacks}
        activeThemeId={duskIndigoThemeId}
        readerBackgroundColor="#171a21"
      />,
    );
    expect(screen.getByRole('button', { name: '黛蓝' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: '墨纸' })).toBeNull();
    expect(
      screen.getByRole('button', { name: '阅读器纸张：黛蓝' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getAllByTitle('文章 / 电子书')).toHaveLength(3);
    expect(screen.getByText('PDF 将保留原始页面颜色')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    expect(callbacks.onSelectTheme).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '亮色' }));
    expect(callbacks.onSelectTheme).toHaveBeenLastCalledWith(inkPaperThemeId, '#eef4e8');
    expect(callbacks.onSelectReaderBackground).toHaveBeenLastCalledWith('#eef4e8');
  });

  it('closes the picker without changing settings again', () => {
    const callbacks = props();
    render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '关闭主题选择' }));
    expect(callbacks.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(callbacks.onSelectTheme).not.toHaveBeenCalled();
    expect(callbacks.onSelectReaderBackground).not.toHaveBeenCalled();
  });

  it('opens from the trigger and preserves the source-aware dialog transition', () => {
    const callbacks = props();
    const { rerender } = render(<ThemeSelector {...callbacks} open={false} />);
    const trigger = screen.getByRole('button', { name: '打开主题选择' });
    trigger.getBoundingClientRect = () => ({ x: 640, y: 48, width: 40, height: 40 }) as DOMRect;
    fireEvent.click(trigger);
    expect(callbacks.onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    rerender(<ThemeSelector {...callbacks} />);
    expect(screen.getByRole('dialog', { name: '主题' }).getAttribute('style')).toContain(
      '--dialog-source-origin-x',
    );
  });
});
