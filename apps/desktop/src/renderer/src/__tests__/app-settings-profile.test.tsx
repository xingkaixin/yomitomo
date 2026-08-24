// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProfileSettingsDialog as UserProfileSettingsDialogComponent } from '../settings/app-settings-panels';
import { defaultUser, type UserDraft } from '../settings/app-settings';
import { initializeAppI18n } from '../i18n/app-i18n';
import type { SaveState } from '../shell/app-types';
import type { SaveableDraft } from '../settings/use-saveable-draft';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

vi.mock('../shell/app-toast', () => ({
  appToast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const localStorageStore: Record<string, string> = {};

Object.defineProperty(window, 'localStorage', {
  value: {
    clear: () => {
      for (const key of Object.keys(localStorageStore)) delete localStorageStore[key];
    },
    getItem: (key: string) => localStorageStore[key] ?? null,
    removeItem: (key: string) => {
      delete localStorageStore[key];
    },
    setItem: (key: string, value: string) => {
      localStorageStore[key] = value;
    },
  },
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

type DraftFixtureProps<TValue> = {
  canSave: boolean;
  onChange: (draft: TValue) => void;
  onSave: (draft?: TValue) => unknown;
  saveError?: string;
  saveState: SaveState;
  value: TValue;
};

function fixtureDraft<TValue>({
  canSave,
  onChange,
  onSave,
  saveError = '',
  saveState,
  value,
}: DraftFixtureProps<TValue>): SaveableDraft<TValue> {
  return {
    canSave,
    reset: vi.fn(),
    save: async (override) => (override === undefined ? onSave() : onSave(override)),
    saveError,
    saveState,
    update: onChange,
    value,
  };
}

function UserProfileSettingsDialog({
  draft,
  canSave,
  onChange,
  onClose,
  onSave,
  saveError,
  saveState,
  sourceRect,
}: Omit<DraftFixtureProps<UserDraft>, 'value'> & {
  draft: UserDraft;
  onClose: () => void;
  sourceRect?: React.ComponentProps<typeof UserProfileSettingsDialogComponent>['sourceRect'];
}) {
  return (
    <UserProfileSettingsDialogComponent
      profileDraft={fixtureDraft({
        value: draft,
        canSave,
        onChange,
        onSave,
        saveError,
        saveState,
      })}
      sourceRect={sourceRect}
      onClose={onClose}
    />
  );
}

describe('UserProfileSettingsDialog', () => {
  it('edits identity fields and keeps usernames sanitized', () => {
    const onChange = vi.fn();

    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={onChange}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '行开心' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'xing kaixin!' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ nickname: '行开心' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ username: 'xingkaixin' }));
  });

  it('saves profile changes from the dialog footer', () => {
    const onSave = vi.fn();

    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /保存/ }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it('opens from the profile trigger source', () => {
    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
        sourceRect={{ x: 680, y: 52, width: 40, height: 40 }}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '个人设置' });

    expect(dialog.classList.contains('source-aware-dialog')).toBe(true);
    expect(dialog.getAttribute('style')).toContain('--dialog-source-origin-x');
  });

  it('exposes the selected annotation color state', () => {
    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    expect(
      screen.getByRole('button', { name: '选择颜色 #f4c95d' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: '选择颜色 #efa927' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('keeps the English username help copy compact', () => {
    initializeAppI18n('en');

    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    expect(screen.getByText('For @mentions: letters, numbers, _ and -.')).toBeTruthy();
    expect(screen.queryByText(/Supports letters, numbers/)).toBeNull();
  });
});
