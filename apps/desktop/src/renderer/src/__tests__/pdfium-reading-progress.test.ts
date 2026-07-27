// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  clampPageIndex,
  pdfPageProgressPercent,
} from '../source/pdfium/app-source-bookcase-pdfium-reading-progress';

describe('pdfium reading progress', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clamps PDF page indexes and derives slider progress percent', () => {
    expect(clampPageIndex(Number.NaN, 10)).toBe(0);
    expect(clampPageIndex(-4, 10)).toBe(0);
    expect(clampPageIndex(4.8, 10)).toBe(4);
    expect(clampPageIndex(99, 10)).toBe(9);
    expect(clampPageIndex(3, 0)).toBe(0);

    expect(pdfPageProgressPercent(1, 1)).toBe(100);
    expect(pdfPageProgressPercent(1, 5)).toBe(0);
    expect(pdfPageProgressPercent(3, 5)).toBe(50);
    expect(pdfPageProgressPercent(9, 5)).toBe(100);
  });
});
