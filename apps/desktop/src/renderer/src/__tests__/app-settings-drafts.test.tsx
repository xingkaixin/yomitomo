// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import type { SettingsStorePatch } from '../../../ipc-contract';

import { emptyStore } from '../settings/app-settings';
import { useSettingsDrafts } from '../settings/app-settings-drafts';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useSettingsDrafts', () => {
  it('saves only the general section and preserves unsaved shortcut edits', async () => {
    const latest: { current?: ReturnType<typeof useSettingsDrafts> } = {};
    const saveSettings = vi.fn().mockResolvedValue(emptyStore);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { store: { saveSettings } },
    });

    function Harness() {
      latest.current = useSettingsDrafts({
        store: emptyStore,
        storeSyncSnapshot: emptyStore,
        applyStore,
        applySettingsPatch,
      });
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(latest.current?.general.value).toEqual(emptyStore.settings));

    act(() => {
      latest.current?.general.update({
        ...latest.current.general.value,
        saveArticleImages: !emptyStore.settings.saveArticleImages,
        selectionActionShortcuts: { copy: 'Mod+K', annotate: 'Mod+K', ask: 'Mod+L' },
      });
    });
    await act(async () => void (await latest.current?.general.save()));

    expect(saveSettings).toHaveBeenCalledOnce();
    const payload = saveSettings.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ saveArticleImages: true });
    expect(payload).not.toHaveProperty('selectionActionShortcuts');
    expect(payload).not.toHaveProperty('readingAssistantProviderId');
    expect(latest.current?.shortcuts.value.selectionActionShortcuts).toEqual({
      copy: 'Mod+K',
      annotate: 'Mod+K',
      ask: 'Mod+L',
    });
  });

  it.each([
    ['telemetryEnabled', { telemetryEnabled: false }],
    ['allowLocalNetworkArticleImport', { allowLocalNetworkArticleImport: true }],
  ] as const)('detects %s-only general settings changes', async (_field, settings) => {
    const latest: { current?: ReturnType<typeof useSettingsDrafts> } = {};

    function Harness() {
      latest.current = useSettingsDrafts({
        store: emptyStore,
        storeSyncSnapshot: emptyStore,
        applyStore,
        applySettingsPatch,
      });
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(latest.current?.general.value).toEqual(emptyStore.settings));

    act(() => {
      latest.current?.general.update({ ...emptyStore.settings, ...settings });
    });

    expect(latest.current?.general.canSave).toBe(true);
  });

  it('does not reset edited settings drafts for store updates outside draft sync', async () => {
    const initialStore = makeStore({ settings: { saveArticleImages: false } });
    const articleStore = makeStore({ settings: { saveArticleImages: false } });
    const refreshedStore = makeStore({ settings: { saveArticleImages: false } });
    const latest: { current?: ReturnType<typeof useSettingsDrafts> } = {};

    function Harness({
      store,
      storeSyncSnapshot,
    }: {
      store: DesktopStore;
      storeSyncSnapshot: DesktopStore | null;
    }) {
      latest.current = useSettingsDrafts({
        store,
        storeSyncSnapshot,
        applyStore,
        applySettingsPatch,
      });
      return null;
    }

    const view = render(<Harness store={initialStore} storeSyncSnapshot={initialStore} />);
    await waitFor(() => expect(latest.current?.general.value.saveArticleImages).toBe(false));

    act(() => {
      latest.current?.general.update({
        ...latest.current.general.value,
        saveArticleImages: true,
      });
    });

    view.rerender(<Harness store={articleStore} storeSyncSnapshot={initialStore} />);
    expect(latest.current?.general.value.saveArticleImages).toBe(true);

    view.rerender(<Harness store={refreshedStore} storeSyncSnapshot={refreshedStore} />);
    await waitFor(() => expect(latest.current?.general.value.saveArticleImages).toBe(false));
  });

  it('returns true after saving profile changes', async () => {
    const latest: { current?: ReturnType<typeof useSettingsDrafts> } = {};
    const userPatch = { user: { ...emptyStore.user, nickname: '行开心' } };
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: {
          saveUser: vi.fn().mockResolvedValue(userPatch),
        },
      },
    });

    function Harness() {
      latest.current = useSettingsDrafts({
        store: emptyStore,
        storeSyncSnapshot: emptyStore,
        applyStore,
        applySettingsPatch,
      });
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(latest.current?.profile.value.nickname).toBe('我'));

    act(() => {
      latest.current?.profile.update({ ...emptyStore.user, nickname: '行开心' });
    });

    let result = false;
    await act(async () => {
      result = Boolean(await latest.current?.profile.save());
    });

    expect(result).toBe(true);
    expect(window.yomitomoDesktop.store.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: '行开心' }),
    );
  });

  it('returns false when profile saving fails', async () => {
    const latest: { current?: ReturnType<typeof useSettingsDrafts> } = {};
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: {
          saveUser: vi.fn().mockRejectedValue(new Error('save failed')),
        },
      },
    });

    function Harness() {
      latest.current = useSettingsDrafts({
        store: emptyStore,
        storeSyncSnapshot: emptyStore,
        applyStore,
        applySettingsPatch,
      });
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(latest.current?.profile.value.nickname).toBe('我'));

    act(() => {
      latest.current?.profile.update({ ...emptyStore.user, nickname: '行开心' });
    });

    let result = true;
    await act(async () => {
      result = Boolean(await latest.current?.profile.save());
    });

    expect(result).toBe(false);
  });
});

function makeStore(
  input: { settings?: AppSettingsPatch; user?: DesktopStore['user'] } = {},
): DesktopStore {
  return {
    ...emptyStore,
    user: input.user || emptyStore.user,
    settings: normalizeAppSettings(input.settings),
  };
}

function applyStore(nextStore: DesktopStore) {
  return nextStore;
}

function applySettingsPatch(patch: SettingsStorePatch) {
  return { ...emptyStore, ...patch };
}
