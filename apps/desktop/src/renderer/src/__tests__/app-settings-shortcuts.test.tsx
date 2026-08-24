// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutSettings as ShortcutSettingsComponent } from '../settings/app-settings-panels';
import {
  normalizeSelectionActionShortcutDraft,
  type AppSettingsPatch,
  type ResolvedAppSettings,
} from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import type { SaveState } from '../shell/app-types';
import type { SaveableDraft } from '../settings/use-saveable-draft';
import {
  normalizeAppSettings,
  normalizeTranslationTargetLanguage,
} from '../../../settings/app-settings-normalization';

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

function ShortcutSettings({
  settingsDraft,
  canSave,
  onSettingsChange,
  onSave,
  saveError,
  saveState,
}: Omit<DraftFixtureProps<ResolvedAppSettings>, 'onChange' | 'value'> & {
  onSettingsChange: (draft: ResolvedAppSettings) => void;
  settingsDraft: AppSettingsPatch;
}) {
  return (
    <ShortcutSettingsComponent
      draft={fixtureDraft({
        value: resolvedSettingsFixture(settingsDraft),
        canSave,
        onChange: onSettingsChange,
        onSave,
        saveError,
        saveState,
      })}
    />
  );
}

function resolvedSettingsFixture(settings: AppSettingsPatch): ResolvedAppSettings {
  return {
    ...normalizeAppSettings(settings),
    ...settings,
    selectionActionShortcuts: normalizeSelectionActionShortcutDraft(
      settings.selectionActionShortcuts,
    ),
    bilingualTranslationTargetLanguage: normalizeTranslationTargetLanguage(
      settings.bilingualTranslationTargetLanguage,
    ),
  };
}

describe('ShortcutSettings', () => {
  it('updates the message send shortcut', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getAllByRole('radio')[1]);

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ messageSendShortcut: 'mod-enter' }),
    );
    expect(screen.getAllByText('⏎').some((element) => element.tagName === 'KBD')).toBe(true);
    expect(screen.getByText('消息发送')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '回车发送' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '组合键发送' })).toBeTruthy();
    expect(screen.getByText(/用于想法发布和回复发送，切换即时生效/)).toBeTruthy();
    expect(screen.queryByText(/Command|Enter|macOS|Windows/)).toBeNull();
  });

  it('keeps the current badge on the saved shortcut while editing', () => {
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'mod-enter' }}
        canSave
        onSettingsChange={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    const options = screen.getAllByRole('radio');

    expect(options[0].getAttribute('aria-checked')).toBe('false');
    expect(options[1].getAttribute('aria-checked')).toBe('true');
  });

  it('records single-letter reader action shortcuts', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置复制快捷键' }));
    fireEvent.keyDown(window, { key: 'x' });

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        messageSendShortcut: 'enter',
        selectionActionShortcuts: { copy: 'X', annotate: 'A', ask: 'Q' },
      }),
    );
  });

  it('shows shortcut saved status on the section that changed', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getAllByRole('radio')[1]);
    view.rerender(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'mod-enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    const messageSection = screen.getByText('消息发送').closest('section');
    const selectionSection = screen.getByText('阅读区选区操作').closest('section');

    expect(messageSection).toBeTruthy();
    expect(selectionSection).toBeTruthy();
    expect(within(messageSection!).getByText('已保存')).toBeTruthy();
    expect(within(selectionSection!).queryByText('已保存')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '设置复制快捷键' }));
    fireEvent.keyDown(window, { key: 'x' });
    view.rerender(
      <ShortcutSettings
        settingsDraft={{
          messageSendShortcut: 'mod-enter',
          selectionActionShortcuts: { copy: 'X', annotate: 'A', ask: 'Q' },
        }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    expect(within(messageSection!).queryByText('已保存')).toBeNull();
    expect(within(selectionSection!).getByText('已保存')).toBeTruthy();
  });

  it('keeps recording until a supported letter is pressed', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置记录想法快捷键' }));
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'b' });

    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        messageSendShortcut: 'enter',
        selectionActionShortcuts: { copy: 'C', annotate: 'B', ask: 'Q' },
      }),
    );
  });

  it('records the ask selection shortcut', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置问一下快捷键' }));
    fireEvent.keyDown(window, { key: 'y' });

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        messageSendShortcut: 'enter',
        selectionActionShortcuts: { copy: 'C', annotate: 'A', ask: 'Y' },
      }),
    );
  });

  it('shows conflicts and resets reader action shortcuts', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{
          messageSendShortcut: 'enter',
          selectionActionShortcuts: { copy: 'B', annotate: 'B', ask: 'Q' },
        }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByText(/重复键位会阻止保存/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重置复制为默认 C' }));

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        messageSendShortcut: 'enter',
        selectionActionShortcuts: { copy: 'C', annotate: 'B', ask: 'Q' },
      }),
    );
  });
});
