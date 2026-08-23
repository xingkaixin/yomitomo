// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { changeAppI18nLanguage, initializeAppI18n } from '../i18n/app-i18n';
import { readCachedUiLanguage, writeCachedUiLanguage } from '../i18n/app-language-cache';
import { enResources } from '../i18n/locales/en';
import { jaResources } from '../i18n/locales/ja';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('app language cache', () => {
  it('keeps provider brand names in English for Japanese', () => {
    expect(jaResources.app.settings.models.providerPresets).toEqual(
      enResources.app.settings.models.providerPresets,
    );
  });

  it('defaults invalid or missing cached language to Chinese', () => {
    const storage = memoryStorage();

    expect(readCachedUiLanguage(storage)).toBe('zh-CN');
    storage.setItem('yomitomo.uiLanguage', 'fr');
    expect(readCachedUiLanguage(storage)).toBe('zh-CN');
  });

  it('stores the startup language synchronously', () => {
    const storage = memoryStorage();

    writeCachedUiLanguage('en', storage);

    expect(readCachedUiLanguage(storage)).toBe('en');
  });

  it('preserves Japanese as a supported startup language', () => {
    const storage = memoryStorage();

    writeCachedUiLanguage('ja', storage);

    expect(readCachedUiLanguage(storage)).toBe('ja');
  });

  it('syncs the document title with the active app language', () => {
    initializeAppI18n('zh-CN');
    expect(document.title).toBe('Yomitomo | 伴读 · 你的 AI 阅读伙伴');

    changeAppI18nLanguage('en');
    expect(document.title).toBe('Yomitomo | Reader · Your AI reading companion');

    changeAppI18nLanguage('ja');
    expect(document.title).toBe('Yomitomo | Reader · AI読書パートナー');

    changeAppI18nLanguage('zh-CN');
    expect(document.title).toBe('Yomitomo | 伴读 · 你的 AI 阅读伙伴');
  });
});
