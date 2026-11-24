import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { normalizeUiLanguage, type UiLanguage } from '@yomitomo/shared';

import { zhCNResources, type AppLocaleResource } from './locales/zh-CN';

const loadedLanguages = new Set<UiLanguage>(['zh-CN']);
const pendingLanguageLoads = new Map<UiLanguage, Promise<void>>();
let latestRequestedLanguage: UiLanguage = 'zh-CN';

async function loadLocaleResource(language: UiLanguage): Promise<AppLocaleResource> {
  if (language === 'en') {
    const { enResources } = await import('./locales/en');
    return enResources;
  }
  if (language === 'ja') {
    const { jaResources } = await import('./locales/ja');
    return jaResources;
  }
  return zhCNResources;
}

export function ensureAppI18nLanguage(language: unknown): Promise<UiLanguage> {
  const normalized = normalizeUiLanguage(language);
  if (loadedLanguages.has(normalized)) return Promise.resolve(normalized);
  let loadPromise = pendingLanguageLoads.get(normalized);
  if (!loadPromise) {
    loadPromise = loadLocaleResource(normalized)
      .then((bundle) => {
        if (i18next.isInitialized) {
          i18next.addResourceBundle(normalized, 'app', bundle.app, true, true);
        }
        loadedLanguages.add(normalized);
      })
      .finally(() => {
        pendingLanguageLoads.delete(normalized);
      });
    pendingLanguageLoads.set(normalized, loadPromise);
  }
  return loadPromise.then(() => normalized);
}

export function initializeAppI18n(language: unknown) {
  const normalized = normalizeUiLanguage(language);
  latestRequestedLanguage = normalized;
  if (i18next.isInitialized) {
    changeAppI18nLanguage(normalized);
    return i18next;
  }

  void i18next.use(initReactI18next).init({
    resources: {
      'zh-CN': zhCNResources,
    },
    lng: loadedLanguages.has(normalized) ? normalized : 'zh-CN',
    fallbackLng: 'zh-CN',
    defaultNS: 'app',
    ns: ['app'],
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
  if (!loadedLanguages.has(normalized)) {
    void ensureAppI18nLanguage(normalized).then((loaded) => {
      if (latestRequestedLanguage !== loaded) return;
      void i18next.changeLanguage(loaded);
      syncAppDocumentTitle();
    });
  }
  syncAppDocumentTitle();
  return i18next;
}

export function changeAppI18nLanguage(language: unknown) {
  const normalized = normalizeUiLanguage(language);
  latestRequestedLanguage = normalized;
  if (!i18next.isInitialized) {
    initializeAppI18n(normalized);
    return normalized;
  }
  if (loadedLanguages.has(normalized)) {
    if (i18next.language !== normalized) void i18next.changeLanguage(normalized);
    syncAppDocumentTitle();
    return normalized;
  }
  void ensureAppI18nLanguage(normalized).then((loaded) => {
    if (latestRequestedLanguage !== loaded) return;
    if (i18next.language !== loaded) void i18next.changeLanguage(loaded);
    syncAppDocumentTitle();
  });
  return normalized;
}

export function currentAppI18nLanguage(): UiLanguage {
  return normalizeUiLanguage(i18next.language);
}

export function syncAppDocumentTitle() {
  if (typeof document === 'undefined' || !i18next.isInitialized) return;
  document.title = i18next.t('appTitle');
}
