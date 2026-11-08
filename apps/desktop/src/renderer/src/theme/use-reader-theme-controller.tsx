import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { ResolvedAppSettings, DesktopStore, ThemePreference } from '@yomitomo/shared';
import {
  readerBackgroundTone,
  type ReaderBackgroundTone,
} from '@yomitomo/reader-ui/reader-settings';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import {
  normalizeDesktopReaderSettings,
  readDesktopReaderBackgroundsByTone,
  readDesktopReaderSettings,
  writeDesktopReaderSettings,
} from '../settings/app-reader-settings';
import {
  applyAppTheme,
  readCachedThemePreference,
  themeIdForPreference,
  themeRegistry,
  watchSystemThemeTone,
  writeCachedThemePreference,
  type AppThemeTone,
  type AppThemeId,
} from './app-theme';
import { getDesktopApi } from '../shell/app-desktop-api';

const startupThemePreference = readCachedThemePreference();
const startupThemeId = themeIdForPreference(startupThemePreference);
applyAppTheme(themeRegistry[startupThemeId]);

type ReaderThemeState = {
  activeThemeId: AppThemeId;
  themePreference: ThemePreference;
  selectThemePreference: (preference: ThemePreference) => Promise<void>;
  syncFromSettings: (settings: ResolvedAppSettings) => void;
};

export type ReaderThemeStoreApi = StoreApi<ReaderThemeState>;

type ReaderThemeController = {
  activeThemeId: AppThemeId;
  themePreference: ThemePreference;
  readerTheme: ReaderTheme;
  selectThemePreference: (preference: ThemePreference) => Promise<void>;
  tone: AppThemeTone;
};

export function createReaderThemeStore(input: {
  applyStore: (store: DesktopStore) => void;
}): ReaderThemeStoreApi {
  return createStore<ReaderThemeState>()((set, get) => {
    let latestThemeSave = 0;

    function showPreference(preference: ThemePreference) {
      const themeId = themeIdForPreference(preference);
      if (get().activeThemeId !== themeId) applyAppTheme(themeRegistry[themeId]);
      set({ activeThemeId: themeId, themePreference: preference });
      const currentBackgroundColor = readDesktopReaderSettings().backgroundColor;
      const nextBackgroundColor = readerBackgroundForTone(
        themeRegistry[themeId].meta.tone,
        currentBackgroundColor,
        readDesktopReaderBackgroundsByTone(),
      );
      if (nextBackgroundColor === currentBackgroundColor) return;
      writeDesktopReaderSettings(
        normalizeDesktopReaderSettings({
          ...readDesktopReaderSettings(),
          backgroundColor: nextBackgroundColor,
        }),
      );
    }

    // The store lives as long as the window, so the system listener is never removed.
    watchSystemThemeTone(() => {
      if (get().themePreference === 'system') showPreference('system');
    });

    return {
      activeThemeId: startupThemeId,
      themePreference: startupThemePreference,
      selectThemePreference: async (preference) => {
        showPreference(preference);
        writeCachedThemePreference(preference);
        const themeSave = ++latestThemeSave;
        try {
          const nextStore = await getDesktopApi().store.saveSettings({ themeId: preference });
          // An older save's snapshot would sync the theme back to an earlier choice.
          if (themeSave === latestThemeSave) input.applyStore(nextStore);
        } catch {
          // Keep the immediate visual choice; a later settings sync can reconcile persistence.
        }
      },
      syncFromSettings: (settings) => {
        showPreference(settings.themeId);
        writeCachedThemePreference(settings.themeId);
      },
    };
  });
}

const ReaderThemeStoreContext = createContext<ReaderThemeStoreApi | null>(null);

export function ReaderThemeStoreProvider({
  store,
  children,
}: {
  store: ReaderThemeStoreApi;
  children: ReactNode;
}) {
  return <ReaderThemeStoreContext value={store}>{children}</ReaderThemeStoreContext>;
}

export function useReaderThemeController(): ReaderThemeController {
  const themeStore = useContext(ReaderThemeStoreContext);
  if (!themeStore) throw new Error('ReaderThemeStoreProvider is missing');
  const activeThemeId = useStore(themeStore, (state) => state.activeThemeId);
  const themePreference = useStore(themeStore, (state) => state.themePreference);
  const { selectThemePreference } = themeStore.getState();
  const activeTheme = themeRegistry[activeThemeId];

  return {
    activeThemeId,
    themePreference,
    readerTheme: activeTheme.reader,
    selectThemePreference,
    tone: activeTheme.meta.tone,
  };
}

function readerBackgroundForTone(
  tone: AppThemeTone,
  backgroundColor: string,
  backgroundsByTone: Record<ReaderBackgroundTone, string>,
) {
  return readerBackgroundTone(backgroundColor) === tone ? backgroundColor : backgroundsByTone[tone];
}
