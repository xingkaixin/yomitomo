// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';

import { emptyStore } from '../app-settings';
import { useSettingsDrafts } from '../app-settings-drafts';

afterEach(() => {
  cleanup();
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
});

function makeStore(input: { settings?: DesktopStore['settings'] } = {}): DesktopStore {
  return {
    ...emptyStore,
    settings: input.settings || {},
  };
}

function applyStore(nextStore: DesktopStore) {
  return nextStore;
}
