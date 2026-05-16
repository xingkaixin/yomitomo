// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';

import { emptyStore } from '../app-settings';
import { useDesktopStoreState } from '../app-desktop-store-state';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useDesktopStoreState', () => {
  it('keeps storeRef synchronized with loaded, updated, and applied stores', async () => {
    const initialStore = makeStore({ user: { nickname: '初始用户' } });
    const updatedStore = makeStore({ user: { nickname: '外部更新' } });
    const appliedStore = makeStore({ user: { nickname: '本地应用' } });
    const offStoreUpdated = vi.fn();
    let emitStoreUpdated = noopStoreUpdated;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        getState: vi.fn().mockResolvedValue(initialStore),
        onStoreUpdated: vi.fn((callback: (store: DesktopStore) => void) => {
          emitStoreUpdated = callback;
          return offStoreUpdated;
        }),
      },
    });

    const latest: { current?: ReturnType<typeof useDesktopStoreState> } = {};

    function Harness() {
      latest.current = useDesktopStoreState();
      return null;
    }

    render(<Harness />);

    await waitFor(() => expect(latest.current?.storeLoaded).toBe(true));
    expect(latest.current?.store).toBe(initialStore);
    expect(latest.current?.storeRef.current).toBe(initialStore);

    act(() => {
      emitStoreUpdated(updatedStore);
    });

    expect(latest.current?.store).toBe(updatedStore);
    expect(latest.current?.storeRef.current).toBe(updatedStore);

    act(() => {
      latest.current?.applyStore(appliedStore);
    });

    expect(latest.current?.store).toBe(appliedStore);
    expect(latest.current?.storeRef.current).toBe(appliedStore);
  });
});

function noopStoreUpdated(_store: DesktopStore) {}

function makeStore(
  input: {
    user?: Partial<DesktopStore['user']>;
    settings?: DesktopStore['settings'];
    providers?: DesktopStore['providers'];
    agents?: DesktopStore['agents'];
    articles?: DesktopStore['articles'];
  } = {},
): DesktopStore {
  return {
    user: { ...emptyStore.user, ...input.user },
    settings: input.settings || {},
    providers: input.providers || [],
    agents: input.agents || [],
    articles: input.articles || [],
  };
}
