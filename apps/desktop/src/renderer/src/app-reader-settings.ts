import { useCallback, useEffect, useState } from 'react';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import {
  clampNumber,
  defaultReaderSettings,
  normalizeReaderBackgroundColor,
} from '@yomitomo/reader-ui/reader-settings';

const DESKTOP_READER_SETTINGS_KEY = 'yomitomo.desktop.readerSettings';
const DESKTOP_READER_SETTINGS_EVENT = 'yomitomo:desktop-reader-settings';

export function readDesktopReaderSettings(): ReaderSettings {
  if (typeof window === 'undefined') return defaultReaderSettings;

  try {
    const raw = window.localStorage.getItem(DESKTOP_READER_SETTINGS_KEY);
    if (!raw) return defaultReaderSettings;
    return normalizeDesktopReaderSettings(JSON.parse(raw) as Partial<ReaderSettings>);
  } catch {
    return defaultReaderSettings;
  }
}

export function normalizeDesktopReaderSettings(
  settings: Partial<ReaderSettings> | undefined,
): ReaderSettings {
  return {
    fontSize: clampNumber(settings?.fontSize, 16, 28, defaultReaderSettings.fontSize),
    contentWidth: clampNumber(
      settings?.contentWidth,
      600,
      1080,
      defaultReaderSettings.contentWidth,
    ),
    backgroundColor: normalizeReaderBackgroundColor(settings?.backgroundColor),
  };
}

export function writeDesktopReaderSettings(settings: ReaderSettings) {
  const normalizedSettings = normalizeDesktopReaderSettings(settings);

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(DESKTOP_READER_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    window.dispatchEvent(
      new CustomEvent<ReaderSettings>(DESKTOP_READER_SETTINGS_EVENT, {
        detail: normalizedSettings,
      }),
    );
  } catch {
    // Reader settings are a local preference; failing to persist should not block reading.
  }
}

export function subscribeDesktopReaderSettings(listener: (settings: ReaderSettings) => void) {
  if (typeof window === 'undefined') return () => undefined;

  const handleSettingsChange = (event: Event) => {
    listener(
      normalizeDesktopReaderSettings((event as CustomEvent<Partial<ReaderSettings>>).detail),
    );
  };
  window.addEventListener(DESKTOP_READER_SETTINGS_EVENT, handleSettingsChange);
  return () => window.removeEventListener(DESKTOP_READER_SETTINGS_EVENT, handleSettingsChange);
}

export function useDesktopReaderSettings() {
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    readDesktopReaderSettings(),
  );

  useEffect(() => subscribeDesktopReaderSettings(setReaderSettings), []);

  const updateReaderSettings = useCallback((nextSettings: ReaderSettings) => {
    writeDesktopReaderSettings(nextSettings);
  }, []);

  return [readerSettings, updateReaderSettings] as const;
}
