import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceEbookReaderStyles } from '../app-source-bookcase-ebook-utils';
import { sourceReaderTocStyles } from '../app-source-bookcase-web-utils';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

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
    expect(styles).toContain('background: var(--app-reader-toolbar-bg);');
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

  it('keeps composer cancel buttons neutral in embedded readers', () => {
    expect(styles).toContain(
      '.source-pdf-reader-shell .reader-composer-actions .reader-composer-cancel',
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
