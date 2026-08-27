// @vitest-environment jsdom

import { useCallback, useState } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsPatch, DesktopStore, LlmProvider } from '@yomitomo/shared';
import type { SettingsStorePatch, UserStorePatch } from '../../../ipc-contract';

import { emptyStore } from '../settings/app-settings';
import { useSettingsDrafts } from '../settings/app-settings-drafts';
import type { SettingsSyncSnapshot } from '../shell/app-desktop-store-state';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

const emptySettingsSyncSnapshot = syncSnapshot(emptyStore);

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useSettingsDrafts', () => {
  it('updates the saved profile without overwriting edits made during the save', async () => {
    const pending = deferred<UserStorePatch>();
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { store: { saveUser: () => pending.promise } },
    });
    const { result } = renderStoreDrafts();
    act(() => result.current.profile.update({ ...emptyStore.user, nickname: 'A' }));
    let request: ReturnType<typeof result.current.profile.save>;
    act(() => {
      request = result.current.profile.save();
    });
    act(() => result.current.profile.update({ ...emptyStore.user, nickname: 'B' }));
    let saved: unknown;
    await act(async () => {
      pending.resolve({ user: { ...emptyStore.user, nickname: 'A' } });
      saved = await request;
    });
    expect(result.current.profile.value.nickname).toBe('B');
    expect(result.current.store.user.nickname).toBe('A');
    expect(result.current.profile.canSave).toBe(true);
    expect(result.current.profile.saveState).toBe('idle');
    expect(saved).toBeUndefined();
  });

  it('preserves newer general edits after an autosave override completes', async () => {
    const pending = deferred<DesktopStore>();
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { store: { saveSettings: () => pending.promise } },
    });
    const { result } = renderStoreDrafts();
    const submitted = { ...emptyStore.settings, saveArticleImages: true };
    let request: ReturnType<typeof result.current.general.save>;
    act(() => {
      result.current.general.update(submitted);
      request = result.current.general.save(submitted);
    });
    act(() => result.current.general.update({ ...submitted, saveArticleImages: false }));
    await act(async () => {
      pending.resolve({ ...emptyStore, settings: submitted });
      await request;
    });
    expect(result.current.store.settings.saveArticleImages).toBe(true);
    expect(result.current.general.value.saveArticleImages).toBe(false);
    expect(result.current.general.canSave).toBe(true);
    expect(result.current.general.saveState).toBe('idle');
  });

  it('does not replace a profile restored while saving', async () => {
    const pending = deferred<UserStorePatch>();
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { store: { saveUser: () => pending.promise } },
    });
    const { result, rerender } = renderStoreDrafts();
    let request: ReturnType<typeof result.current.profile.save>;
    act(() => {
      request = result.current.profile.save({ ...emptyStore.user, nickname: 'A' });
    });
    const restored = { ...emptyStore.user, nickname: 'restored' };
    rerender({ snapshot: { ...emptySettingsSyncSnapshot, user: restored } });
    await act(async () => {
      pending.resolve({ user: { ...emptyStore.user, nickname: 'A' } });
      await request;
    });
    expect(result.current.profile.value).toEqual(restored);
    expect(result.current.profile.saveState).toBe('idle');
  });

  it('keeps the selected provider when another provider finishes saving', async () => {
    const first = makeProvider('first');
    const second = makeProvider('second');
    const pending = deferred<DesktopStore>();
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { provider: { save: () => pending.promise } },
    });
    const { result } = renderStoreDrafts({ ...emptyStore, providers: [first, second] });
    const edited = { ...first, name: 'edited' };
    act(() => result.current.provider.update(edited));
    let request: ReturnType<typeof result.current.provider.save>;
    act(() => {
      request = result.current.provider.save();
    });
    act(() => result.current.provider.select(second));
    let saved: unknown;
    await act(async () => {
      pending.resolve({ ...emptyStore, providers: [edited, second] });
      saved = await request;
    });
    expect(result.current.store.providers[0]).toEqual(edited);
    expect(result.current.provider.value).toEqual(second);
    expect(result.current.provider.selectedProviderId).toBe(second.id);
    expect(result.current.provider.saveState).toBe('idle');
    expect(saved).toBeUndefined();
  });

  it('blocks duplicate creation while retaining the provider identity and newer input', async () => {
    const pending = deferred<DesktopStore>();
    const created = makeProvider('created');
    const save = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({
        ...emptyStore,
        providers: [{ ...created, name: 'newer input' }],
      });
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { provider: { save } },
    });
    const { result } = renderStoreDrafts();
    act(() => result.current.provider.create());
    let request: ReturnType<typeof result.current.provider.save>;
    act(() => {
      request = result.current.provider.save();
    });
    act(() =>
      result.current.provider.update({ ...result.current.provider.value, name: 'newer input' }),
    );
    const canSaveWhilePending = result.current.provider.canSave;
    await act(async () => void (await result.current.provider.save()));
    const pendingRequestIds = save.mock.calls.map(([draft]) => draft.id ?? null);
    await act(async () => {
      pending.resolve({ ...emptyStore, providers: [created] });
      await request;
    });
    expect(canSaveWhilePending).toBe(false);
    expect(pendingRequestIds).toEqual([null]);
    expect(result.current.provider.value).toMatchObject({ id: created.id, name: 'newer input' });
    expect(result.current.provider.canSave).toBe(true);
    await act(async () => void (await result.current.provider.save()));
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: created.id, name: 'newer input' }),
    );
    expect(result.current.provider.canSave).toBe(false);
    expect(result.current.provider.saveState).toBe('saved');
  });

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
        settingsSyncSnapshot: emptySettingsSyncSnapshot,
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
        settingsSyncSnapshot: emptySettingsSyncSnapshot,
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
      settingsSyncSnapshot,
    }: {
      store: DesktopStore;
      settingsSyncSnapshot: SettingsSyncSnapshot | null;
    }) {
      latest.current = useSettingsDrafts({
        store,
        settingsSyncSnapshot,
        applyStore,
        applySettingsPatch,
      });
      return null;
    }

    const initialSyncSnapshot = syncSnapshot(initialStore);
    const view = render(
      <Harness store={initialStore} settingsSyncSnapshot={initialSyncSnapshot} />,
    );
    await waitFor(() => expect(latest.current?.general.value.saveArticleImages).toBe(false));

    act(() => {
      latest.current?.general.update({
        ...latest.current.general.value,
        saveArticleImages: true,
      });
    });

    view.rerender(<Harness store={articleStore} settingsSyncSnapshot={initialSyncSnapshot} />);
    expect(latest.current?.general.value.saveArticleImages).toBe(true);

    view.rerender(
      <Harness store={refreshedStore} settingsSyncSnapshot={syncSnapshot(refreshedStore)} />,
    );
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
        settingsSyncSnapshot: emptySettingsSyncSnapshot,
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
        settingsSyncSnapshot: emptySettingsSyncSnapshot,
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

function renderStoreDrafts(initialStore = emptyStore) {
  return renderHook(
    ({ snapshot }: { snapshot: SettingsSyncSnapshot }) => {
      const [store, setStore] = useState(initialStore);
      const updateStore = useCallback((next: DesktopStore) => {
        setStore(next);
        return next;
      }, []);
      const drafts = useSettingsDrafts({
        store,
        applyStore: updateStore,
        applySettingsPatch: (patch) => updateStore({ ...store, ...patch }),
        settingsSyncSnapshot: snapshot,
      });
      return { store, ...drafts };
    },
    { initialProps: { snapshot: syncSnapshot(initialStore) } },
  );
}

function makeProvider(id: string): LlmProvider {
  return {
    id,
    name: id,
    type: 'openai-chat',
    baseUrl: 'https://example.com',
    apiKey: '',
    modelName: 'test',
    createdAt: emptyStore.user.updatedAt,
    updatedAt: emptyStore.user.updatedAt,
  };
}

function applyStore(nextStore: DesktopStore) {
  return nextStore;
}

function applySettingsPatch(patch: SettingsStorePatch) {
  return { ...emptyStore, ...patch };
}

function syncSnapshot(store: DesktopStore): SettingsSyncSnapshot {
  return { user: store.user, settings: store.settings };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
