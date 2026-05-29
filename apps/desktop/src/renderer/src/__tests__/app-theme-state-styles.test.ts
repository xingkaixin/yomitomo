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

  it('keeps the WeRead reader header on reader toolbar tokens', () => {
    expect(styles).toContain(`.weread-bookcase-header {
  display: grid;`);
    expect(styles).toContain('border-bottom: 1px solid var(--app-reader-toolbar-border);');
    expect(styles).toContain('background: var(--app-reader-toolbar-bg);');
  });
});
