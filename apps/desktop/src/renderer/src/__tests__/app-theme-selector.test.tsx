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
import { playAppSoundEffect } from '../sound/app-sound-effects';

vi.mock('../sound/app-sound-effects', () => ({ playAppSoundEffect: vi.fn() }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  initializeAppI18n('zh-CN');
});

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
  it('selects a theme immediately with one drawing sound and keeps the picker open', () => {
    const callbacks = props();
    const { rerender } = render(<ThemeSelector {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '青芽' }));
    expect(callbacks.onSelectTheme).toHaveBeenCalledExactlyOnceWith(shadLingoThemeId);
    expect(playAppSoundEffect).toHaveBeenCalledExactlyOnceWith(
      'theme.appearance_switch',
      callbacks.soundSettings,
    );
    rerender(<ThemeSelector {...callbacks} activeThemeId={shadLingoThemeId} />);
    fireEvent.click(screen.getByRole('button', { name: '青芽' }));
    expect(playAppSoundEffect).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectTheme).toHaveBeenCalledTimes(1);
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
    expect(playAppSoundEffect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '阅读器纸张：淡绿' }));
    expect(callbacks.onSelectReaderBackground).toHaveBeenCalledExactlyOnceWith('#eef4e8');
    expect(playAppSoundEffect).toHaveBeenCalledExactlyOnceWith(
      'theme.appearance_switch',
      callbacks.soundSettings,
    );
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
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    expect(callbacks.onSelectTheme).toHaveBeenCalledTimes(1);
    expect(playAppSoundEffect).toHaveBeenCalledExactlyOnceWith(
      'theme.appearance_switch',
      callbacks.soundSettings,
    );
    fireEvent.click(screen.getByRole('button', { name: '亮色' }));
    expect(playAppSoundEffect).toHaveBeenCalledTimes(2);
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

  it('opens the picker from its trigger', () => {
    const callbacks = props();
    const { rerender } = render(<ThemeSelector {...callbacks} open={false} />);
    const trigger = screen.getByRole('button', { name: '打开主题选择' });
    fireEvent.click(trigger);
    expect(callbacks.onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    rerender(<ThemeSelector {...callbacks} />);
    expect(screen.getByRole('dialog', { name: '主题' })).toBeTruthy();
  });
});
