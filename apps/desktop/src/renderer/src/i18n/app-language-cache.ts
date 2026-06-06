import { normalizeUiLanguage, type UiLanguage } from '@yomitomo/shared';

const cachedUiLanguageStorageKey = 'yomitomo.uiLanguage';

export function readCachedUiLanguage(
  storage: Storage | undefined = browserLocalStorage(),
): UiLanguage {
  if (!storage) return 'zh-CN';

  try {
    return normalizeUiLanguage(storage.getItem(cachedUiLanguageStorageKey));
  } catch {
    return 'zh-CN';
  }
}

export function writeCachedUiLanguage(
  language: UiLanguage,
  storage: Storage | undefined = browserLocalStorage(),
) {
  if (!storage) return;

  try {
    storage.setItem(cachedUiLanguageStorageKey, normalizeUiLanguage(language));
  } catch {
    // Language cache is a startup optimization; persisted settings remain the source of truth.
  }
}

function browserLocalStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
