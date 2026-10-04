import { readRendererStyles } from './css-test-utils';
import { describe, expect, it } from 'vitest';
import { sourceReaderTocStyles } from '../source/web/app-source-bookcase-web-utils';

const styles = readRendererStyles();

describe('source reader interaction styles', () => {
  it('hides native web article selection during custom drag selection', () => {
    expect(sourceReaderTocStyles).toContain(
      '.source-reader-shell .reader-article.is-web-selection-gesture ::selection',
    );
    expect(sourceReaderTocStyles).toContain(
      '.source-reader-shell .reader-article.is-web-selection-gesture::selection',
    );
    expect(sourceReaderTocStyles).toContain('background:transparent');
  });

  it('removes source reader hold and cursor motion for reduced motion users', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.source-note-delete\.is-holding::before \{[\s\S]*width: 100%;[\s\S]*animation: none !important;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.source-virtual-cursor \{[\s\S]*transition: none !important;[\s\S]*will-change: auto;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.source-virtual-cursor\.is-leaving \{[\s\S]*animation: none !important;[\s\S]*filter: none;[\s\S]*opacity: 0;[\s\S]*\}/,
    );
  });

  it('keeps PDFium annotation rail above the full-size PDF article surface', () => {
    expect(styles).toMatch(
      /\.source-pdf-reader-shell \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*\}/,
    );
    expect(styles).toContain('--pdf-reader-toolbar-height: 66px;');
    expect(styles).toMatch(
      /\.source-pdf-reader-shell \.reader-toolbar \{[\s\S]*min-height: var\(--pdf-reader-toolbar-height\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.pdf-reader-main \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdf-reader-shell \.reader-main \{[\s\S]*grid-template-rows: minmax\(0, 1fr\);[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-surface \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-app \{[\s\S]*grid-template-rows: var\(--pdf-reader-toolbar-height\) minmax\(0, 1fr\);[\s\S]*height: var\(--app-viewport-height\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-main \{[\s\S]*height: calc\(var\(--app-viewport-height\) - var\(--pdf-reader-toolbar-height\)\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-toc \{[\s\S]*position: absolute;[\s\S]*grid-column: 1;[\s\S]*grid-row: 1;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-surface-frame \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 1;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-surface-frame,[\s\S]*\.source-pdfium-spike-reader \.reader-canvas \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-article \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdfium-spike-reader \.reader-annotation-rail \{[\s\S]*z-index: 4;[\s\S]*\}/,
    );
  });
});
