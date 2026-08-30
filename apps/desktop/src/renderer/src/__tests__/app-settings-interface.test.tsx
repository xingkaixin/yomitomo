// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSettings as GeneralSettingsComponent } from '../settings/app-settings-panels';
import {
  normalizeSelectionActionShortcutDraft,
  type AppSettingsPatch,
  type ResolvedAppSettings,
} from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import { playAppSoundEffect } from '../sound/app-sound-effects';
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

function GeneralSettings({
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
    <GeneralSettingsComponent
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

describe('GeneralSettings', () => {
  it('updates the save images setting', () => {
    const onSettingsChange = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ saveArticleImages: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /采集文章时保存正文图片/ }));

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ saveArticleImages: true }),
    );
  });

  it('requires confirmation before enabling local network article imports', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ allowLocalNetworkArticleImport: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /允许导入本机和私有网络地址/ }));

    expect(onSettingsChange).not.toHaveBeenCalled();
    expect(screen.getByText('允许访问本机和私有网络？')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '确认开启' }));

    const nextDraft = expect.objectContaining({ allowLocalNetworkArticleImport: true });
    expect(onSettingsChange).toHaveBeenCalledWith(nextDraft);
    expect(onSave).toHaveBeenCalledWith(nextDraft);
  });

  it('disables local network article imports without confirmation', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ allowLocalNetworkArticleImport: true }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /允许导入本机和私有网络地址/ }));

    expect(screen.queryByText('允许访问本机和私有网络？')).toBeNull();
    const nextDraft = expect.objectContaining({ allowLocalNetworkArticleImport: false });
    expect(onSettingsChange).toHaveBeenCalledWith(nextDraft);
    expect(onSave).toHaveBeenCalledWith(nextDraft);
  });

  it('saves the telemetry opt-out setting without confirmation', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ telemetryEnabled: true }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /发送匿名使用指标/ }));

    expect(screen.queryByText('允许访问本机和私有网络？')).toBeNull();
    const nextDraft = expect.objectContaining({ telemetryEnabled: false });
    expect(onSettingsChange).toHaveBeenCalledWith(nextDraft);
    expect(onSave).toHaveBeenCalledWith(nextDraft);
  });

  it('retries telemetry saving even when the current draft is not saveable', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <GeneralSettings
        settingsDraft={{ telemetryEnabled: true }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /发送匿名使用指标/ }));
    view.rerender(
      <GeneralSettings
        settingsDraft={{ telemetryEnabled: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveError="save failed"
        saveState="error"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(onSave).toHaveBeenLastCalledWith();
  });

  it('saves the selected interface language', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'zh-CN' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    const nextDraft = expect.objectContaining({ uiLanguage: 'en' });
    expect(onSettingsChange).toHaveBeenCalledWith(nextDraft);
    expect(onSave).toHaveBeenCalledWith(nextDraft);
  });

  it('saves sound effect controls', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <GeneralSettings
        settingsDraft={{ soundEffectsEnabled: false, soundEffectsVolume: 0.7 }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '启用应用音效' }));
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ soundEffectsEnabled: true, soundEffectsVolume: 0.7 }),
    );
    expect(playAppSoundEffect).toHaveBeenLastCalledWith(
      'settings.sound_preview',
      expect.objectContaining({ soundEffectsEnabled: true, soundEffectsVolume: 0.7 }),
    );

    view.rerender(
      <GeneralSettings
        settingsDraft={{ soundEffectsEnabled: true, soundEffectsVolume: 0.7 }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );
    const slider = screen.getByRole('slider', { name: '音效响度' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      bottom: 36,
      height: 36,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.pointerDown(slider, { button: 0, clientX: 70, pointerId: 1 });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(slider, { button: 0, clientX: 70, pointerId: 1 });
    const pointerDraft = expect.objectContaining({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    });
    expect(onSettingsChange).toHaveBeenLastCalledWith(pointerDraft);
    expect(onSave).toHaveBeenLastCalledWith(pointerDraft);
    expect(playAppSoundEffect).toHaveBeenLastCalledWith('settings.sound_preview', pointerDraft);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSave).toHaveBeenCalledTimes(2);

    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    const keyboardDraft = expect.objectContaining({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.4,
    });
    expect(onSettingsChange).toHaveBeenLastCalledWith(keyboardDraft);
    expect(onSave).toHaveBeenLastCalledWith(keyboardDraft);
  });

  it('shows the saved status only on the general section that changed', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'zh-CN', saveArticleImages: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    view.rerender(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'en', saveArticleImages: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    const languageSection = screen.getByText('界面').closest('section');
    const collectionSection = screen.getByText('采集').closest('section');
    const soundSection = screen.getByText('音效').closest('section');

    expect(languageSection).toBeTruthy();
    expect(collectionSection).toBeTruthy();
    expect(soundSection).toBeTruthy();
    expect(within(languageSection!).getByText('已保存')).toBeTruthy();
    expect(within(soundSection!).queryByText('已保存')).toBeNull();
    expect(within(collectionSection!).queryByText('已保存')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: /采集文章时保存正文图片/ }));
    view.rerender(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'en', saveArticleImages: true }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    expect(within(languageSection!).queryByText('已保存')).toBeNull();
    expect(within(collectionSection!).getByText('已保存')).toBeTruthy();
  });
});
