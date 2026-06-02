import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function ruleBodies(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    styles.matchAll(new RegExp(`${escapedSelector} \\{(?<body>[^}]+)\\}`, 'g')),
  ).map((match) => match.groups?.body || '');
}

describe('theme state styles', () => {
  it('defines source-aware home dialog motion with reduced motion support', () => {
    expect(styles).toContain(`.source-aware-dialog {
  transform-origin: var(--dialog-source-origin-x, 50%) var(--dialog-source-origin-y, 50%);`);
    expect(styles).toContain('animation: source-aware-dialog-enter var(--modal-open-dur, 250ms)');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.source-aware-dialog \{[\s\S]*animation: none;[\s\S]*will-change: auto;[\s\S]*\}/,
    );
  });

  it('keeps provider card interaction states on theme tokens', () => {
    expect(styles).toContain(`.provider-card:hover {
  border-color: var(--app-interactive-hover-border);`);
    expect(styles).toContain(`.provider-card-menu button.provider-delete-menu-item {
  color: var(--app-action-danger-bg);`);
    expect(styles).toContain(
      'background: color-mix(in srgb, var(--app-action-danger-bg) 14%, transparent);',
    );
    expect(styles).not.toContain('.provider-card:hover {\n  border-color: hsl(3 62% 39% / 0.32);');
  });

  it('keeps reader delete hold states on danger tokens', () => {
    expect(styles).toContain(`.source-note-delete {
  position: relative;`);
    expect(styles).toContain(
      'background: color-mix(in srgb, var(--app-action-danger-bg) 7%, transparent);',
    );
    expect(styles).toContain(`.library-item-delete:hover {
  background: color-mix(in srgb, var(--app-action-danger-bg) 12%, transparent);
  color: var(--app-action-danger-bg);`);
    expect(styles).not.toContain('background: hsl(5 54% 38% / 0.12);');
  });

  it('keeps library search focus on interactive focus tokens', () => {
    const searchFocusRules = ruleBodies('.library-search input:focus');

    expect(searchFocusRules.length).toBeGreaterThan(0);
    expect(
      searchFocusRules.every((rule) => rule.includes('var(--app-interactive-hover-border)')),
    ).toBe(true);
    expect(
      searchFocusRules.some((rule) => rule.includes('var(--app-interactive-focus-ring)')),
    ).toBe(true);
    expect(searchFocusRules.some((rule) => rule.includes('hsl(3 62% 39% / 0.12)'))).toBe(false);
  });

  it('keeps assistant line cues on theme surfaces', () => {
    expect(styles).toContain(`.agent-list-line-bubble,
.agent-list-line-bubble.is-entering,
.agent-list-line-bubble.is-resting {`);
    expect(styles).toContain('var(--agent-accent, var(--app-interactive-link)) 28%');
    expect(styles).toContain('background: hsl(var(--card));');
    expect(styles).toContain('color: hsl(var(--foreground));');
    expect(styles).toContain(`.agent-list-line-bubble::after {
  border-color: inherit;
  background: hsl(var(--card));`);
  });

  it('keeps the WeRead reader header aligned with source reader chrome', () => {
    expect(styles).toContain(`.weread-bookcase-header {
  display: grid;`);
    expect(styles).toContain('border-bottom: 1px solid hsl(var(--foreground));');
    expect(styles).toContain('background: hsl(var(--card));');
    expect(styles).toMatch(/\.weread-bookcase-title \{[\s\S]*-webkit-app-region: drag;[\s\S]*\}/);
    expect(styles).toMatch(
      /\.weread-bookcase-header button \{[\s\S]*-webkit-app-region: no-drag;[\s\S]*\}/,
    );
  });

  it('keeps distillation status and primary entry on theme tokens', () => {
    expect(styles).toContain('.annotation-discussion-sedimentation-entry button.is-primary {');
    expect(styles).toContain('background: var(--app-action-primary-bg);');
    expect(styles).toContain('color: var(--app-action-primary-fg);');
    expect(styles).toContain('.annotation-sedimentation-status.is-published {');
    expect(styles).toContain('color: var(--app-action-primary-bg);');
    expect(styles).toContain('.annotation-sedimentation-status.is-draft {');
    expect(styles).toContain('color: var(--app-reader-muted);');
  });

  it('keeps discussion selection and separators on reader theme tokens', () => {
    expect(styles).toContain('.annotation-discussion-idea.is-selected {');
    expect(styles).toContain('box-shadow: inset 4px 0 0 var(--app-reader-accent-strong);');
    expect(styles).toContain('.annotation-discussion-thread-divider::before,');
    expect(styles).toContain(
      'background: color-mix(in srgb, var(--app-reader-line) 72%, transparent);',
    );
    expect(styles).toContain('.annotation-discussion-thread-scroll {');
    expect(styles).toContain('overflow: auto;');
  });
});
