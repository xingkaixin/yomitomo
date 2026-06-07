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
      /\.pdf-reader-toolbar \{[\s\S]*border-bottom: 1px solid hsl\(var\(--foreground\)\);[\s\S]*background: hsl\(var\(--card\)\);[\s\S]*-webkit-app-region: no-drag;[\s\S]*\}/,
    );
    expect(styles).toMatch(/\.pdf-reader-title \{[\s\S]*-webkit-app-region: drag;[\s\S]*\}/);
    expect(styles).toMatch(/\.pdf-reader-controls \{[\s\S]*-webkit-app-region: no-drag;[\s\S]*\}/);
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

  it('uses the independent reader content background for source readers', () => {
    expect(styles).toContain('background: var(--reader-content-bg, hsl(var(--card)));');
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
});
