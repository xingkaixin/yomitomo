import { useEffect, useState } from 'react';
import type { AppSettings, DesktopStore } from '@yomitomo/shared';
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

const startupThemeId = readCachedThemeId();
const startupThemeIdsByTone = readCachedThemeIdsByTone();
const startupReaderSettings = readDesktopReaderSettings();
const startupReaderBackgroundsByTone = readDesktopReaderBackgroundsByTone();
applyAppTheme(themeRegistry[startupThemeId]);

type UseReaderThemeControllerInput = {
  appLocked: boolean;
  applyStore: (store: DesktopStore) => void;
  settings: AppSettings;
  storeLoaded: boolean;
  storeLoadError: unknown;
};

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

export function useReaderThemeController({
  appLocked,
  applyStore,
  settings,
  storeLoaded,
  storeLoadError,
}: UseReaderThemeControllerInput): ReaderThemeController {
  const [activeThemeId, setActiveThemeId] = useState<AppThemeId>(startupThemeId);
  const [themeIdsByTone, setThemeIdsByTone] = useState(startupThemeIdsByTone);
  const [readerBackgroundColor, setReaderBackgroundColor] = useState(
    compatibleReaderBackgroundForTheme(startupThemeId, startupReaderSettings.backgroundColor),
  );
  const [readerBackgroundsByTone, setReaderBackgroundsByTone] = useState(
    startupReaderBackgroundsByTone,
  );

  useEffect(() => {
    applyAppTheme(themeRegistry[activeThemeId]);
  }, [activeThemeId]);

  useEffect(() => {
    if (!storeLoaded || storeLoadError || appLocked) return;
    const storedThemeId = resolveAppThemeId(settings.themeId);
    setActiveThemeId((currentThemeId) =>
      currentThemeId === storedThemeId ? currentThemeId : storedThemeId,
    );
    setThemeIdsByTone((currentThemeIds) => ({
      ...currentThemeIds,
      [themeRegistry[storedThemeId].meta.tone]: storedThemeId,
    }));
    const currentReaderSettings = readDesktopReaderSettings();
    const nextBackgroundColor = compatibleReaderBackgroundForTheme(
      storedThemeId,
      currentReaderSettings.backgroundColor,
    );
    if (nextBackgroundColor !== currentReaderSettings.backgroundColor) {
      const nextSettings = normalizeDesktopReaderSettings({
        ...currentReaderSettings,
        backgroundColor: nextBackgroundColor,
      });
      setReaderBackgroundColor(nextSettings.backgroundColor);
      setReaderBackgroundsByTone((currentBackgrounds) => ({
        ...currentBackgrounds,
        [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
      }));
      writeDesktopReaderSettings(nextSettings);
    }
    writeCachedThemeId(storedThemeId);
  }, [appLocked, settings.themeId, storeLoadError, storeLoaded]);

  async function selectTheme(themeId: AppThemeId, preferredReaderBackgroundColor?: string) {
    const themeTone = themeRegistry[themeId].meta.tone;
    setActiveThemeId(themeId);
    setThemeIdsByTone((currentThemeIds) => ({
      ...currentThemeIds,
      [themeTone]: themeId,
    }));
    writeCachedThemeId(themeId);
    const nextBackgroundColor = compatibleReaderBackgroundForTheme(
      themeId,
      preferredReaderBackgroundColor || readerBackgroundColor,
      activeThemeId,
    );
    if (nextBackgroundColor !== readerBackgroundColor) {
      const nextSettings = normalizeDesktopReaderSettings({
        ...readDesktopReaderSettings(),
        backgroundColor: nextBackgroundColor,
      });
      setReaderBackgroundColor(nextSettings.backgroundColor);
      setReaderBackgroundsByTone((currentBackgrounds) => ({
        ...currentBackgrounds,
        [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
      }));
      writeDesktopReaderSettings(nextSettings);
    }
    try {
      const nextStore = await window.yomitomoDesktop.saveSettings({ themeId });
      applyStore(nextStore);
    } catch {
      // Keep the immediate visual choice; a later settings sync can reconcile persistence.
    }
  }

  function selectReaderBackground(backgroundColor: string) {
    const nextSettings = normalizeDesktopReaderSettings({
      ...readDesktopReaderSettings(),
      backgroundColor,
    });
    setReaderBackgroundColor(nextSettings.backgroundColor);
    setReaderBackgroundsByTone((currentBackgrounds) => ({
      ...currentBackgrounds,
      [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
    }));
    writeDesktopReaderSettings(nextSettings);
  }

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
