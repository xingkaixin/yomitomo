import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import {
  clampNumber,
  defaultReaderSettings,
  normalizeReaderBackgroundColor,
} from '@yomitomo/reader-ui/reader-settings';

const DESKTOP_READER_SETTINGS_KEY = 'yomitomo.desktop.readerSettings';

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
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      DESKTOP_READER_SETTINGS_KEY,
      JSON.stringify(normalizeDesktopReaderSettings(settings)),
    );
  } catch {
    // Reader settings are a local preference; failing to persist should not block reading.
  }
}
