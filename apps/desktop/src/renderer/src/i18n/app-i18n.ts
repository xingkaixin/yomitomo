import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { normalizeUiLanguage, type UiLanguage } from '@yomitomo/shared';

import { enResources } from './locales/en';
import { zhCNResources } from './locales/zh-CN';

const resources = {
  'zh-CN': zhCNResources,
  en: enResources,
} as const;

export function initializeAppI18n(language: unknown) {
  const normalized = normalizeUiLanguage(language);
  if (i18next.isInitialized) {
    void i18next.changeLanguage(normalized);
    syncAppDocumentTitle();
    return i18next;
  }

  void i18next.use(initReactI18next).init({
    resources,
    lng: normalized,
    fallbackLng: 'zh-CN',
    defaultNS: 'app',
    ns: ['app'],
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
  syncAppDocumentTitle();
  return i18next;
}

export function changeAppI18nLanguage(language: unknown) {
  const normalized = normalizeUiLanguage(language);
  if (!i18next.isInitialized) {
    initializeAppI18n(normalized);
    return normalized;
  }
  if (i18next.language !== normalized) void i18next.changeLanguage(normalized);
  syncAppDocumentTitle();
  return normalized;
}

export function currentAppI18nLanguage(): UiLanguage {
  return normalizeUiLanguage(i18next.language);
}

export function syncAppDocumentTitle() {
  if (typeof document === 'undefined' || !i18next.isInitialized) return;
  document.title = i18next.t('appTitle');
}
