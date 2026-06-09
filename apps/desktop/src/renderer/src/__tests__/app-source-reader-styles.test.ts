import { readRendererStyles } from './css-test-utils';
import { describe, expect, it } from 'vitest';
import { sourceEbookReaderStyles } from '../source/ebook/app-source-bookcase-ebook-utils';
import { sourceReaderTocStyles } from '../source/web/app-source-bookcase-web-utils';

const styles = readRendererStyles();

describe('source reader annotation styles', () => {
  it('keeps source reader specific styles on reader theme variables', () => {
    expect(sourceReaderTocStyles).toContain('background:var(--app-reader-toc-bg);');
    expect(sourceReaderTocStyles).toContain('color:var(--reader-muted);');
    expect(sourceReaderTocStyles).not.toContain('background:rgba(255,253,248,.72);');
    expect(sourceReaderTocStyles).not.toContain('color:#746d63;');
    expect(sourceEbookReaderStyles).toContain('drop-shadow(0 1px 0 var(--reader-paper))');
    expect(sourceEbookReaderStyles).not.toContain('drop-shadow(0 1px 0 rgba(255,253,248,.72))');
  });

  it('keeps PDF and profile preview surfaces on theme variables', () => {
    expect(styles).toContain('background: var(--app-reader-toolbar-control-bg);');
    expect(styles).toMatch(
      /\.source-pdf-reader-shell \.reader-toolbar \{[\s\S]*background: hsl\(var\(--card\)\);[\s\S]*padding: 12px var\(--reader-titlebar-padding-right\) 12px var\(--reader-titlebar-back-left\);[\s\S]*-webkit-app-region: drag;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdf-reader-shell \.reader-toolbar-article-copy \{[\s\S]*-webkit-app-region: drag;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdf-reader-shell \.reader-toolbar-actions,[\s\S]*\.source-pdf-reader-shell \.reader-toolbar button \{[\s\S]*-webkit-app-region: no-drag;[\s\S]*\}/,
    );
    expect(styles).toContain('--reader-bg: var(--app-reader-bg);');
    expect(styles).toContain('background: var(--app-reader-note-quote-bg);');
    expect(styles).toContain('background: var(--app-reader-note-bg);');
    expect(styles).toContain('var(--app-paper-pattern-image),');
    expect(styles).toContain(
      'background-size: var(--app-paper-pattern-size) var(--app-paper-pattern-size);',
    );
    expect(styles).toMatch(
      /\.weread-bookcase \{[\s\S]*background: var\(--app-paper-pattern-image\), var\(--app-paper-pattern-bg\);[\s\S]*background-size: var\(--app-paper-pattern-size\) var\(--app-paper-pattern-size\);/,
    );
    expect(styles).not.toContain('background: hsl(48 100% 99% / 0.66);');
    expect(styles).not.toContain('background: hsl(48 100% 99% / 0.74);');
  });

  it('keeps PDF table of contents on shared embedded reader styles', () => {
    expect(styles).toMatch(
      /\.source-reader-shell \.reader-app\.has-toc\.is-toc-open \.reader-toc,[\s\S]*\.source-ebook-reader-shell \.reader-app\.has-toc\.is-toc-open \.reader-toc,[\s\S]*\.source-pdf-reader-shell \.reader-app\.has-toc\.is-toc-open \.reader-toc \{[\s\S]*z-index: var\(--app-z-panel\);[\s\S]*border-radius: 0;[\s\S]*background: hsl\(var\(--card\)\);[\s\S]*box-shadow: none;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-reader-shell \.reader-floating-toolbar,[\s\S]*\.source-ebook-reader-shell \.reader-floating-toolbar,[\s\S]*\.source-pdf-reader-shell \.reader-floating-toolbar \{[\s\S]*z-index: var\(--app-z-overlay\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-reader-shell \.reader-toc-markers i,[\s\S]*\.source-ebook-reader-shell \.reader-toc-markers i,[\s\S]*\.source-pdf-reader-shell \.reader-toc-markers i \{[\s\S]*border-color: hsl\(var\(--border\) \/ 0\.82\);[\s\S]*box-shadow: none;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-reader-shell \.reader-toc-summary,[\s\S]*\.source-ebook-reader-shell \.reader-toc-summary,[\s\S]*\.source-pdf-reader-shell \.reader-toc-summary \{[\s\S]*border-radius: 0;[\s\S]*background: hsl\(var\(--card\)\);[\s\S]*color: hsl\(var\(--muted-foreground\)\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.source-pdf-reader-shell \.reader-app\.has-toc \.reader-toc \{[\s\S]*top: 84px;[\s\S]*z-index: var\(--app-z-panel\);[\s\S]*width: min\(320px, calc\(100% - 36px\)\);[\s\S]*\}/,
    );
    expect(styles).not.toMatch(
      /\.source-pdf-reader-shell \.reader-app\.has-toc \.reader-toc \{[\s\S]*background: var\(--app-reader-toc-bg\);/,
    );
    expect(styles).not.toMatch(
      /\.source-pdf-reader-shell \.reader-app\.has-toc \.reader-toc \{[\s\S]*box-shadow: var\(--app-reader-selection-menu-shadow\);/,
    );
  });

  it('uses the independent reader content background for source readers', () => {
    expect(styles).toContain('background: var(--reader-content-bg, var(--app-reader-paper));');
    expect(styles).toMatch(
      /\.pdfium-spike-viewport \{[\s\S]*background: var\(--app-paper-pattern-image\), var\(--app-paper-pattern-bg\);[\s\S]*background-size: var\(--app-paper-pattern-size\) var\(--app-paper-pattern-size\);/,
    );
    expect(styles).not.toContain('background-size: 28px 28px;');
    expect(styles).toContain('background: white;');
    expect(styles).toContain('.pdfium-spike-page :where(canvas, img) {');
    expect(styles).toContain('mix-blend-mode: normal;');
    expect(styles).toContain(
      '.source-pdf-reader-shell .reader-app.is-reader-background-light .pdfium-spike-page {',
    );
    expect(styles).toMatch(
      /\.source-pdf-reader-shell\s+\.reader-app\.is-reader-background-light\s+\.pdfium-spike-page\s+:where\(canvas, img\) \{/,
    );
    expect(styles).not.toMatch(
      /\.source-pdf-reader-shell\s+\.reader-app\.is-reader-background-dark\s+\.pdfium-spike-page\s+:where\(canvas, img\)/,
    );
  });

  it('keeps settings item hover and selected borders on theme variables', () => {
    expect(styles).toContain('border-color: var(--app-interactive-hover-border);');
    expect(styles).toContain('border-color: var(--app-interactive-selected-border);');
    expect(styles).not.toContain('border-color: hsl(8 45% 48% / 0.4);');
    expect(styles).not.toContain('border-color: hsl(3 62% 39% / 0.52);');
  });

  it('does not add a left rail when a discussion thread is open', () => {
    expect(styles).not.toContain('box-shadow: inset 2px 0 0 hsl(var(--foreground));');
    expect(styles).toContain(`.source-pdf-reader-shell .reader-discussion-thread.is-open {
  border-color: hsl(var(--border) / 0.78);
  background: hsl(var(--card));
  box-shadow: none;
}`);
  });

  it('keeps action delete text from inheriting comment badge styles', () => {
    expect(styles).not.toContain('.source-pdf-reader-shell .reader-comment-author span');
    expect(styles).toContain('.source-pdf-reader-shell .reader-comment-author > span');
    expect(styles).toContain('.source-pdf-reader-shell .reader-delete-note > span {');
    expect(styles).toContain('color: var(--app-action-danger-bg);');
    expect(styles).toContain('background: transparent;');
    expect(styles).toContain('border-radius: 0;');
  });

  it('does not recolor source note quote text on hover', () => {
    expect(styles).not.toContain('.source-note-quote:hover');
    expect(styles).not.toMatch(/\.source-note-quote:hover\s*\{[\s\S]*color:/);
  });

  it('keeps composer cancel buttons neutral in embedded readers', () => {
    expect(styles).toContain(
      '.source-pdf-reader-shell .floating-composer-actions .reader-composer-cancel',
    );
    expect(styles).toContain('background: hsl(0 0% 0% / 0.055);');
  });

  it('keeps stacked assistant avatars round in embedded readers', () => {
    expect(styles).toContain('flex: 0 0 auto;');
    expect(styles).toContain('min-width: 28px;');
    expect(styles).toContain('border-radius: 999px;');
    expect(styles).toContain(
      '.source-pdf-reader-shell .reader-inline-composer-panel:has(.reader-agent-avatar-stack)',
    );
    expect(styles).toContain('.source-pdf-reader-shell .reader-review-invite {');
    expect(styles).toContain('background: hsl(var(--card));');
  });

  it('keeps embedded reader empty states from inheriting note card borders', () => {
    expect(styles).toMatch(
      /\.source-reader-shell \.reader-empty,[\s\S]*\.source-ebook-reader-shell \.reader-empty,[\s\S]*\.source-pdf-reader-shell \.reader-empty \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;[\s\S]*\}/,
    );
    expect(styles).not.toMatch(
      /\.source-pdf-reader-shell \.reader-note,\s*\.source-pdf-reader-shell \.reader-empty/,
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
