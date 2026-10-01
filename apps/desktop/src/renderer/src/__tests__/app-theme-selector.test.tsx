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

function apply() {
  fireEvent.click(screen.getByRole('button', { name: '应用搭配' }));
}

describe('ThemeSelector', () => {
  it('shows visible themes, readable paper samples, and library/reader/PDF scenes', () => {
    render(<ThemeSelector {...props()} />);
    expect(screen.getByRole('dialog', { name: '主题' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /青芽.*白色纸面/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /米色纸/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /墨黑/ })).toBeNull();
    expect(screen.getByRole('button', { name: '阅读器纸张：淡绿' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '阅读器纸张：松烟' })).toBeNull();
    expect(screen.getByRole('button', { name: '应用搭配' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '文章 / 电子书' }));
    expect(screen.getByTitle('文章 / 电子书')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(screen.getByTitle('PDF')).toBeTruthy();
  });

  it('previews a theme and paper without saving, then applies the exact combination once', () => {
    const callbacks = props();
    render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: /青芽.*白色纸面/ }));
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：淡绿' }));
    expect(callbacks.onSelectTheme).not.toHaveBeenCalled();
    expect(callbacks.onSelectReaderBackground).not.toHaveBeenCalled();
    expect(callbacks.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('尚未应用')).toBeTruthy();
    expect(screen.getByTitle('文章 / 电子书')).toBeTruthy();
    apply();
    expect(callbacks.onSelectTheme).toHaveBeenCalledExactlyOnceWith(shadLingoThemeId, '#eef4e8');
    expect(callbacks.onSelectReaderBackground).toHaveBeenCalledExactlyOnceWith('#eef4e8');
    expect(callbacks.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each(['取消', '关闭主题选择'])(
    'discards the draft on %s and initializes the next opening from saved settings',
    (action) => {
      const callbacks = props();
      const { rerender } = render(<ThemeSelector {...callbacks} />);
      fireEvent.click(screen.getByRole('button', { name: /墨纸/ }));
      fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：暖米' }));
      fireEvent.click(screen.getByRole('button', { name: action }));
      expect(callbacks.onSelectTheme).not.toHaveBeenCalled();
      expect(callbacks.onSelectReaderBackground).not.toHaveBeenCalled();
      expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
      rerender(<ThemeSelector {...callbacks} open={false} />);
      rerender(<ThemeSelector {...callbacks} open />);
      expect(screen.getByRole('button', { name: /暖白纸面/ }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(
        screen.getByRole('button', { name: '阅读器纸张：纸白' }).getAttribute('aria-pressed'),
      ).toBe('true');
      expect(screen.getByRole('button', { name: '应用搭配' }).hasAttribute('disabled')).toBe(true);
    },
  );

  it('browses dark choices without changing the candidate or saving settings', () => {
    const callbacks = props();
    render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    expect(screen.getByRole('button', { name: /墨黑/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /墨纸/ })).toBeNull();
    expect(screen.getByRole('button', { name: '阅读器纸张：松烟' })).toBeTruthy();
    expect(screen.getByText('当前搭配')).toBeTruthy();
    expect(screen.getByRole('button', { name: '应用搭配' }).hasAttribute('disabled')).toBe(true);
    expect(callbacks.onSelectTheme).not.toHaveBeenCalled();
    expect(callbacks.onSelectReaderBackground).not.toHaveBeenCalled();
  });

  it('uses remembered choices when selecting paper in another tone and keeps both drafts when browsing', () => {
    const callbacks = props();
    render(
      <ThemeSelector
        {...callbacks}
        activeThemeId={inkPaperThemeId}
        readerBackgroundsByTone={{ light: '#eef4e8', dark: '#171a21' }}
        themeIdsByTone={{ light: inkPaperThemeId, dark: duskIndigoThemeId }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：暖米' }));
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：黛蓝' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(screen.getByText('PDF 将保留原始页面颜色')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '亮色' }));
    fireEvent.click(screen.getByRole('button', { name: /墨纸/ }));
    expect(
      screen.getByRole('button', { name: '阅读器纸张：暖米' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    fireEvent.click(screen.getByRole('button', { name: /冷调靛青夜色/ }));
    apply();
    expect(callbacks.onSelectTheme).toHaveBeenCalledExactlyOnceWith(duskIndigoThemeId, '#171a21');
    expect(callbacks.onSelectReaderBackground).toHaveBeenCalledExactlyOnceWith('#171a21');
  });

  it('applies an independent paper change without saving the theme again', () => {
    const callbacks = props();
    render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：淡绿' }));
    apply();
    expect(callbacks.onSelectTheme).not.toHaveBeenCalled();
    expect(callbacks.onSelectReaderBackground).toHaveBeenCalledExactlyOnceWith('#eef4e8');
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
