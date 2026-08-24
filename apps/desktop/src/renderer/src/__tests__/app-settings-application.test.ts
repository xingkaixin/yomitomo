// @vitest-environment jsdom

import type { DesktopStore } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeAppI18n } from '../i18n/app-i18n';
import { applySavedSettings } from '../settings/app-settings-application';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  window.localStorage.clear();
});

describe('saved settings application', () => {
  it('caches the saved ui language before applying the store', () => {
    const applyStore = vi.fn((nextStore: DesktopStore) => nextStore);
    const nextStore = { settings: { uiLanguage: 'en' } } as DesktopStore;

    applySavedSettings(nextStore, applyStore);

    expect(window.localStorage.getItem('yomitomo.uiLanguage')).toBe('en');
    expect(applyStore).toHaveBeenCalledWith(nextStore);
  });
});
