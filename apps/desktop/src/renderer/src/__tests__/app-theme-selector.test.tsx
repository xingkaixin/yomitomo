// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultReaderBackgroundColor } from '@yomitomo/reader-ui/reader-settings';
import { ThemeSelector } from '../app-theme-selector';
import { defaultThemeId, inkPaperThemeId } from '../app-theme';

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
    expect(screen.getByRole('button', { name: /当前 Yomitomo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /墨纸/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /米色纸/ })).toBeNull();
    expect(screen.getByRole('button', { name: '阅读器纸张：纸白' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '阅读器纸张：淡绿' })).toBeTruthy();

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
});
