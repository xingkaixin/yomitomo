import type { DesktopStore } from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';

import { changeAppI18nLanguage } from '../i18n/app-i18n';
import { writeCachedUiLanguage } from '../i18n/app-language-cache';

export function applySavedSettings(
  nextStore: DesktopStore,
  applyStore: (store: DesktopStore) => DesktopStore,
) {
  const nextLanguage = normalizeUiLanguage(nextStore.settings.uiLanguage);
  writeCachedUiLanguage(nextLanguage);
  changeAppI18nLanguage(nextLanguage);
  applyStore(nextStore);
}
