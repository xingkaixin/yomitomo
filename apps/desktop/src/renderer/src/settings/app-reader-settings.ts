import { useSyncExternalStore } from 'react';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import {
  clampNumber,
  defaultReaderSettings,
  defaultReaderBackgroundForTone,
  normalizeReaderBackgroundColor,
  readerBackgroundTone,
  type ReaderBackgroundTone,
} from '@yomitomo/reader-ui/reader-settings';

const DESKTOP_READER_SETTINGS_KEY = 'yomitomo.desktop.readerSettings';
const DESKTOP_READER_SETTINGS_EVENT = 'yomitomo:desktop-reader-settings';
const DESKTOP_READER_BACKGROUNDS_BY_TONE_KEY = 'yomitomo.desktop.readerBackgroundsByTone';

let cachedReaderSettings: { raw: string | null; settings: ReaderSettings } = {
  raw: null,
  settings: defaultReaderSettings,
};

export function readDesktopReaderSettings(): ReaderSettings {
  if (typeof window === 'undefined') return defaultReaderSettings;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DESKTOP_READER_SETTINGS_KEY);
  } catch {
    return defaultReaderSettings;
  }
  // useSyncExternalStore needs the same object until the stored value changes.
  if (raw !== cachedReaderSettings.raw) {
    cachedReaderSettings = { raw, settings: parseDesktopReaderSettings(raw) };
  }
  return cachedReaderSettings.settings;
}

function parseDesktopReaderSettings(raw: string | null): ReaderSettings {
  if (!raw) return defaultReaderSettings;
  try {
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
    writeDesktopReaderBackgroundForTone(normalizedSettings.backgroundColor);
    window.dispatchEvent(
      new CustomEvent<ReaderSettings>(DESKTOP_READER_SETTINGS_EVENT, {
        detail: normalizedSettings,
      }),
    );
  } catch {
    // Reader settings are a local preference; failing to persist should not block reading.
  }
}

export function readDesktopReaderBackgroundsByTone(): Record<ReaderBackgroundTone, string> {
  if (typeof window === 'undefined') return defaultReaderBackgroundsByTone();

  try {
    const raw = window.localStorage.getItem(DESKTOP_READER_BACKGROUNDS_BY_TONE_KEY);
    return normalizeReaderBackgroundsByTone(JSON.parse(raw || '{}'));
  } catch {
    return defaultReaderBackgroundsByTone();
  }
}

export function readDesktopReaderBackgroundForTone(tone: ReaderBackgroundTone): string {
  return readDesktopReaderBackgroundsByTone()[tone];
}

export function writeDesktopReaderBackgroundForTone(backgroundColor: string) {
  if (typeof window === 'undefined') return;

  try {
    const normalizedBackground = normalizeReaderBackgroundColor(backgroundColor);
    const tone = readerBackgroundTone(normalizedBackground);
    const nextBackgrounds = {
      ...readDesktopReaderBackgroundsByTone(),
      [tone]: normalizedBackground,
    };
    window.localStorage.setItem(
      DESKTOP_READER_BACKGROUNDS_BY_TONE_KEY,
      JSON.stringify(nextBackgrounds),
    );
  } catch {
    // Reader paper history is a local preference; the active settings are still usable.
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
  const readerSettings = useSyncExternalStore(
    subscribeDesktopReaderSettings,
    readDesktopReaderSettings,
  );
  return [readerSettings, writeDesktopReaderSettings] as const;
}

function defaultReaderBackgroundsByTone(): Record<ReaderBackgroundTone, string> {
  return {
    light: defaultReaderBackgroundForTone('light'),
    dark: defaultReaderBackgroundForTone('dark'),
  };
}

function normalizeReaderBackgroundsByTone(value: unknown): Record<ReaderBackgroundTone, string> {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    light: resolveReaderBackgroundForTone(input.light, 'light'),
    dark: resolveReaderBackgroundForTone(input.dark, 'dark'),
  };
}

function resolveReaderBackgroundForTone(value: unknown, tone: ReaderBackgroundTone): string {
  const backgroundColor = normalizeReaderBackgroundColor(typeof value === 'string' ? value : '');
  return readerBackgroundTone(backgroundColor) === tone
    ? backgroundColor
    : defaultReaderBackgroundForTone(tone);
}
