// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeSelector } from '../app-theme-selector';
import { defaultThemeId, inkPaperThemeId } from '../app-theme';

afterEach(cleanup);

describe('ThemeSelector', () => {
  it('shows only user-visible themes with real preview variables', () => {
    render(
      <ThemeSelector
        activeThemeId={defaultThemeId}
        open
        onOpenChange={() => undefined}
        onSelectTheme={() => undefined}
      />,
    );

    expect(screen.getByRole('dialog', { name: '主题' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /纸白/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /墨纸/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /米色纸/ })).toBeNull();

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
        onOpenChange={onOpenChange}
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /墨纸/ }));

    expect(onSelectTheme).toHaveBeenCalledWith(inkPaperThemeId);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '主题' })).toBeTruthy();
  });
});
