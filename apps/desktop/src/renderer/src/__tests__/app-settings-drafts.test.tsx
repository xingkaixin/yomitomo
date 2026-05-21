// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';

import { emptyStore } from '../app-settings';
import { useSettingsDrafts } from '../app-settings-drafts';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useSettingsDrafts', () => {
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
      latest.current = useSettingsDrafts({ store, storeSyncSnapshot, applyStore });
      return null;
    }

    const view = render(<Harness store={initialStore} storeSyncSnapshot={initialStore} />);
    await waitFor(() => expect(latest.current?.settingsDraft.saveArticleImages).toBe(false));

    act(() => {
      latest.current?.updateGeneralSettingsDraft({ saveArticleImages: true });
    });

    view.rerender(<Harness store={articleStore} storeSyncSnapshot={initialStore} />);
    expect(latest.current?.settingsDraft.saveArticleImages).toBe(true);

    view.rerender(<Harness store={refreshedStore} storeSyncSnapshot={refreshedStore} />);
    await waitFor(() => expect(latest.current?.settingsDraft.saveArticleImages).toBe(false));
  });

  it('returns true after saving profile changes', async () => {
    const latest: { current?: ReturnType<typeof useSettingsDrafts> } = {};
    const nextStore = makeStore({
      user: { ...emptyStore.user, nickname: '行开心' },
    });
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        saveUser: vi.fn().mockResolvedValue(nextStore),
      },
    });

    function Harness() {
      latest.current = useSettingsDrafts({
        store: emptyStore,
        storeSyncSnapshot: emptyStore,
        applyStore,
      });
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(latest.current?.userDraft.nickname).toBe('我'));

    act(() => {
      latest.current?.updateUserDraft({ ...emptyStore.user, nickname: '行开心' });
    });

    let result = false;
    await act(async () => {
      result = Boolean(await latest.current?.saveProfileDraft());
    });

    expect(result).toBe(true);
    expect(window.yomitomoDesktop.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: '行开心' }),
    );
  });

  it('returns false when profile saving fails', async () => {
    const latest: { current?: ReturnType<typeof useSettingsDrafts> } = {};
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        saveUser: vi.fn().mockRejectedValue(new Error('save failed')),
      },
    });

    function Harness() {
      latest.current = useSettingsDrafts({
        store: emptyStore,
        storeSyncSnapshot: emptyStore,
        applyStore,
      });
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(latest.current?.userDraft.nickname).toBe('我'));

    act(() => {
      latest.current?.updateUserDraft({ ...emptyStore.user, nickname: '行开心' });
    });

    let result = true;
    await act(async () => {
      result = Boolean(await latest.current?.saveProfileDraft());
    });

    expect(result).toBe(false);
  });
});

function makeStore(
  input: { settings?: DesktopStore['settings']; user?: DesktopStore['user'] } = {},
): DesktopStore {
  return {
    ...emptyStore,
    user: input.user || emptyStore.user,
    settings: input.settings || {},
  };
}

function applyStore(nextStore: DesktopStore) {
  return nextStore;
}
