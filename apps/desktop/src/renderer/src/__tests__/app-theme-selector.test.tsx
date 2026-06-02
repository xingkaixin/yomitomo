// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultReaderBackgroundColor } from '@yomitomo/reader-ui/reader-settings';
import { ThemeSelector } from '../app-theme-selector';
import { defaultThemeId, duskIndigoThemeId, inkBlackThemeId, inkPaperThemeId } from '../app-theme';

afterEach(cleanup);

describe('ThemeSelector', () => {
  it('shows only user-visible themes with real preview variables', () => {
    render(
      <ThemeSelector
        activeThemeId={defaultThemeId}
        open
        readerBackgroundColor={defaultReaderBackgroundColor}
        onOpenChange={() => undefined}
        onSelectReaderBackground={() => undefined}
        onSelectTheme={() => undefined}
      />,
    );

    expect(screen.getByRole('dialog', { name: '主题' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '亮色' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /当前 Yomitomo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /墨纸/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /墨黑/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /米色纸/ })).toBeNull();
    expect(screen.getByRole('button', { name: '阅读器纸张：纸白' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '阅读器纸张：淡绿' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '阅读器纸张：松烟' })).toBeNull();
    expect(screen.queryByText('PDF 将保留原始页面颜色')).toBeNull();

    const preview = document.querySelector('.theme-preview-frame') as HTMLElement | null;
    expect(preview?.style.getPropertyValue('--app-paper-pattern-image')).toBeTruthy();
    expect(preview?.style.getPropertyValue('--app-interactive-link')).toBeTruthy();
  });

  it('selects a theme without closing the dialog', () => {
    const onSelectTheme = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ThemeSelector
        activeThemeId={defaultThemeId}
        open
        readerBackgroundColor={defaultReaderBackgroundColor}
        onOpenChange={onOpenChange}
        onSelectReaderBackground={() => undefined}
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /墨纸/ }));

    expect(onSelectTheme).toHaveBeenCalledWith(inkPaperThemeId);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '主题' })).toBeTruthy();
  });

  it('selects the extracted ink black theme', () => {
    const onSelectTheme = vi.fn();

    render(
      <ThemeSelector
        activeThemeId={inkBlackThemeId}
        open
        readerBackgroundColor="#242019"
        onOpenChange={() => undefined}
        onSelectReaderBackground={() => undefined}
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /墨黑/ }));

    expect(onSelectTheme).toHaveBeenCalledWith(inkBlackThemeId);
  });

  it('selects the extracted dusk indigo theme', () => {
    const onSelectTheme = vi.fn();

    render(
      <ThemeSelector
        activeThemeId={duskIndigoThemeId}
        open
        readerBackgroundColor="#171a21"
        onOpenChange={() => undefined}
        onSelectReaderBackground={() => undefined}
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /冷调靛青夜色/ }));

    expect(onSelectTheme).toHaveBeenCalledWith(duskIndigoThemeId);
  });

  it('switches the visible theme and paper category together', () => {
    const onSelectReaderBackground = vi.fn();
    const onSelectTheme = vi.fn();

    render(
      <ThemeSelector
        activeThemeId={defaultThemeId}
        open
        readerBackgroundColor={defaultReaderBackgroundColor}
        onOpenChange={() => undefined}
        onSelectReaderBackground={onSelectReaderBackground}
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '暗色' }));

    expect(onSelectTheme).toHaveBeenCalledWith(inkBlackThemeId);
    expect(onSelectReaderBackground).toHaveBeenCalledWith('#242019');
  });

  it('selects the independent reader paper background', () => {
    const onSelectReaderBackground = vi.fn();

    render(
      <ThemeSelector
        activeThemeId={defaultThemeId}
        open
        readerBackgroundColor={defaultReaderBackgroundColor}
        onOpenChange={() => undefined}
        onSelectReaderBackground={onSelectReaderBackground}
        onSelectTheme={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：淡绿' }));

    expect(onSelectReaderBackground).toHaveBeenCalledWith('#eef4e8');
  });

  it('selects the extracted ink paper background within the dark category', () => {
    const onSelectReaderBackground = vi.fn();

    render(
      <ThemeSelector
        activeThemeId={inkBlackThemeId}
        open
        readerBackgroundColor="#242019"
        onOpenChange={() => undefined}
        onSelectReaderBackground={onSelectReaderBackground}
        onSelectTheme={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '阅读器纸张：纸白' })).toBeNull();
    expect(screen.getByText('PDF 将保留原始页面颜色')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：松烟' }));

    expect(onSelectReaderBackground).toHaveBeenCalledWith('#242019');
  });

  it('selects the dusk indigo reader paper background within the dark category', () => {
    const onSelectReaderBackground = vi.fn();

    render(
      <ThemeSelector
        activeThemeId={duskIndigoThemeId}
        open
        readerBackgroundColor="#171a21"
        onOpenChange={() => undefined}
        onSelectReaderBackground={onSelectReaderBackground}
        onSelectTheme={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：黛蓝' }));

    expect(onSelectReaderBackground).toHaveBeenCalledWith('#171a21');
  });
});
