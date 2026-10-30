import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { ResolvedAppSettings, DesktopStore } from '@yomitomo/shared';
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
  readCachedThemeIdsByTone,
  readCachedThemeId,
  resolveAppThemeId,
  themeRegistry,
  writeCachedThemeId,
  type AppThemeTone,
  type AppThemeId,
} from './app-theme';
import { getDesktopApi } from '../shell/app-desktop-api';

const startupThemeId = readCachedThemeId();
const startupThemeIdsByTone = readCachedThemeIdsByTone();
const startupReaderSettings = readDesktopReaderSettings();
const startupReaderBackgroundsByTone = readDesktopReaderBackgroundsByTone();
applyAppTheme(themeRegistry[startupThemeId]);

type ReaderThemeState = {
  activeThemeId: AppThemeId;
  themeIdsByTone: Record<AppThemeTone, AppThemeId>;
  readerBackgroundColor: string;
  readerBackgroundsByTone: Record<ReaderBackgroundTone, string>;
  selectReaderBackground: (backgroundColor: string) => void;
  selectTheme: (themeId: AppThemeId, preferredReaderBackgroundColor?: string) => Promise<void>;
  syncFromSettings: (settings: ResolvedAppSettings) => void;
};

export type ReaderThemeStoreApi = StoreApi<ReaderThemeState>;

type ReaderThemeController = {
  activeThemeId: AppThemeId;
  readerBackgroundColor: string;
  readerBackgroundsByTone: Record<ReaderBackgroundTone, string>;
  readerTheme: ReaderTheme;
  selectReaderBackground: (backgroundColor: string) => void;
  selectTheme: (themeId: AppThemeId, preferredReaderBackgroundColor?: string) => Promise<void>;
  themeIdsByTone: Record<AppThemeTone, AppThemeId>;
  tone: AppThemeTone;
};

export function createReaderThemeStore(input: {
  applyStore: (store: DesktopStore) => void;
}): ReaderThemeStoreApi {
  return createStore<ReaderThemeState>()((set, get) => {
    function showTheme(themeId: AppThemeId) {
      if (get().activeThemeId !== themeId) applyAppTheme(themeRegistry[themeId]);
      set((state) => ({
        activeThemeId: themeId,
        themeIdsByTone: { ...state.themeIdsByTone, [themeRegistry[themeId].meta.tone]: themeId },
      }));
    }

    function saveReaderBackground(backgroundColor: string) {
      const nextSettings = normalizeDesktopReaderSettings({
        ...readDesktopReaderSettings(),
        backgroundColor,
      });
      set((state) => ({
        readerBackgroundColor: nextSettings.backgroundColor,
        readerBackgroundsByTone: {
          ...state.readerBackgroundsByTone,
          [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
        },
      }));
      writeDesktopReaderSettings(nextSettings);
    }

    return {
      activeThemeId: startupThemeId,
      themeIdsByTone: startupThemeIdsByTone,
      readerBackgroundColor: compatibleReaderBackgroundForTheme(
        startupThemeId,
        startupReaderSettings.backgroundColor,
      ),
      readerBackgroundsByTone: startupReaderBackgroundsByTone,
      selectReaderBackground: saveReaderBackground,
      selectTheme: async (themeId, preferredReaderBackgroundColor) => {
        const { activeThemeId, readerBackgroundColor } = get();
        showTheme(themeId);
        writeCachedThemeId(themeId);
        const nextBackgroundColor = compatibleReaderBackgroundForTheme(
          themeId,
          preferredReaderBackgroundColor || readerBackgroundColor,
          preferredReaderBackgroundColor ? undefined : activeThemeId,
        );
        if (nextBackgroundColor !== readerBackgroundColor)
          saveReaderBackground(nextBackgroundColor);
        try {
          const nextStore = await getDesktopApi().store.saveSettings({ themeId });
          input.applyStore(nextStore);
        } catch {
          // Keep the immediate visual choice; a later settings sync can reconcile persistence.
        }
      },
      syncFromSettings: (settings) => {
        const storedThemeId = resolveAppThemeId(settings.themeId);
        showTheme(storedThemeId);
        const currentBackgroundColor = readDesktopReaderSettings().backgroundColor;
        const nextBackgroundColor = compatibleReaderBackgroundForTheme(
          storedThemeId,
          currentBackgroundColor,
        );
        if (nextBackgroundColor !== currentBackgroundColor) {
          saveReaderBackground(nextBackgroundColor);
        }
        writeCachedThemeId(storedThemeId);
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
  const readerBackgroundColor = useStore(themeStore, (state) => state.readerBackgroundColor);
  const readerBackgroundsByTone = useStore(themeStore, (state) => state.readerBackgroundsByTone);
  const themeIdsByTone = useStore(themeStore, (state) => state.themeIdsByTone);
  const { selectReaderBackground, selectTheme } = themeStore.getState();
  const activeTheme = themeRegistry[activeThemeId];

  return {
    activeThemeId,
    readerBackgroundColor,
    readerBackgroundsByTone,
    readerTheme: activeTheme.reader,
    selectReaderBackground,
    selectTheme,
    themeIdsByTone,
    tone: activeTheme.meta.tone,
  };
}

export function compatibleReaderBackgroundForTheme(
  themeId: AppThemeId,
  backgroundColor: string,
  previousThemeId?: AppThemeId,
) {
  const tone = themeRegistry[themeId].meta.tone;
  if (readerBackgroundTone(backgroundColor) !== tone) return themeRegistry[themeId].reader.paper;
  if (
    previousThemeId &&
    previousThemeId !== themeId &&
    backgroundColor === themeRegistry[previousThemeId].reader.paper
  ) {
    return themeRegistry[themeId].reader.paper;
  }
  return backgroundColor;
}
