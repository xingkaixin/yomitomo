import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('annotation discussion styles', () => {
  it('keeps the add thought modal editor integrated with the modal shell', () => {
    expect(styles).toMatch(
      /\.floating-composer\.annotation-discussion-add-editor \{[\s\S]*border: 0;[\s\S]*border-radius: 0 0 16px 16px;[\s\S]*box-shadow: none;[\s\S]*\}/,
    );
  });

  it('keeps discussion assistant avatar stacks connected to proximity hover variables', () => {
    expect(styles).toMatch(
      /\.annotation-discussion-add-agents \.reader-agent-avatar-stack-item \{[\s\S]*transform: translateY\(var\(--avatar-shift, 0px\)\) scale\(var\(--avatar-scale-active, 1\)\);[\s\S]*transition:[\s\S]*transform var\(--avatar-dur, 320ms\) var\(--avatar-ease-in, cubic-bezier\(0\.22, 1, 0\.36, 1\)\)[\s\S]*will-change: transform;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-agent-dock \.reader-agent-avatar-stack-item \{[\s\S]*transform: translateY\(var\(--avatar-shift, 0px\)\) scale\(var\(--avatar-scale-active, 1\)\);[\s\S]*transition:[\s\S]*transform var\(--avatar-dur, 320ms\) var\(--avatar-ease-in, cubic-bezier\(0\.22, 1, 0\.36, 1\)\)[\s\S]*will-change: transform;[\s\S]*\}/,
    );
  });

  it('keeps the discussion idea sidebar usable when collapsed', () => {
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-collapsed \{[\s\S]*grid-template-columns: var\(--annotation-discussion-ideas-rail-width\) minmax\(0, 1fr\);[\s\S]*\}/,
    );
    expect(styles).toContain(
      '--annotation-discussion-ideas-overlay-width: clamp(260px, 42%, 340px);',
    );
    expect(styles).toContain('--annotation-discussion-ideas-rail-width: 68px;');
    expect(styles).not.toContain('.annotation-discussion-layout.is-ideas-overlay-open {');
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-idea-list,[\s\S]*\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-ideas > p \{[\s\S]*display: none;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-ideas-toggle \{[\s\S]*width: 40px;[\s\S]*height: 40px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-ideas-count \{[\s\S]*min-width: 40px;[\s\S]*height: 40px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed \.annotation-discussion-add-thought \{[\s\S]*width: 40px;[\s\S]*height: 40px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-layout\.is-ideas-content-collapsed[\s\S]*\.annotation-discussion-sedimentation-entry[\s\S]*button \{[\s\S]*width: 40px;[\s\S]*min-height: 40px;[\s\S]*\}/,
    );
    expect(styles).not.toContain('.annotation-discussion-layout.is-ideas-overlay-open::after {');
    expect(styles).toContain(
      '.annotation-discussion-layout.is-ideas-overlay-open .annotation-discussion-ideas {',
    );
    expect(styles).toContain('z-index: 12;');
    expect(styles).toContain('width: var(--annotation-discussion-ideas-overlay-width);');
    expect(styles).toContain('background: var(--app-reader-paper);');
    expect(styles).toContain('18px 0 46px color-mix');
    expect(styles).toContain(
      '.annotation-discussion-layout.is-ideas-overlay-open .annotation-discussion-ideas header {',
    );
    expect(styles).toContain('grid-template-columns: 40px auto minmax(0, 1fr) 40px;');
    expect(styles).toContain(
      '.annotation-discussion-layout.is-ideas-overlay-open .annotation-discussion-thread {',
    );
    expect(styles).toContain('grid-column: 1 / -1;');
    expect(styles).toContain('grid-row: 1;');
    expect(styles).not.toContain(
      'is-ideas-overlay-open .annotation-discussion-thread {\n  padding',
    );
  });
});
