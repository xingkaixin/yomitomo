import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('source reader annotation styles', () => {
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
    expect(styles).toContain('background: transparent;');
    expect(styles).toContain('border-radius: 0;');
  });

  it('keeps composer cancel buttons neutral in embedded readers', () => {
    expect(styles).toContain(
      '.source-pdf-reader-shell .reader-composer-actions .reader-composer-cancel',
    );
    expect(styles).toContain('background: hsl(0 0% 0% / 0.055);');
  });

  it('keeps focus co-reading mention menus compact in embedded readers', () => {
    expect(styles).toContain('.source-pdf-reader-shell .reader-focus-agent-menu {');
    expect(styles).toContain('width: 176px;');
    expect(styles).toContain('0 20px 48px hsl(0 0% 0% / 0.18)');
  });
});
