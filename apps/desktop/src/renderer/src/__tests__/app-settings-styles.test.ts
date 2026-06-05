import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function rulesFor(selector: string) {
  return Array.from(styles.matchAll(/(?<selectors>[^{}]+) \{(?<body>[^}]+)\}/g))
    .filter((match) =>
      (match.groups?.selectors || '')
        .split(',')
        .some((item) => item.trim().split('\n').at(-1)?.trim() === selector),
    )
    .map((match) => match.groups?.body || '');
}

function expectRule(selector: string, properties: string[]) {
  expect(
    rulesFor(selector).some((rule) => properties.every((property) => rule.includes(property))),
  ).toBe(true);
}

describe('settings styles', () => {
  it('frames the library entry settings as a local card', () => {
    expectRule('.library-content-source-card-field', [
      'border: 1px solid hsl(var(--border) / 0.78);',
      'border-radius: 0;',
      'background: hsl(var(--card));',
      'padding: 12px 14px 10px;',
      'box-shadow: none;',
    ]);
  });

  it('uses the shared paper pattern for function pages', () => {
    const paperPatternProperties = [
      'background: var(--app-paper-pattern-image), var(--app-paper-pattern-bg);',
      'background-size: var(--app-paper-pattern-size) var(--app-paper-pattern-size);',
    ];

    expectRule('.settings-panel', paperPatternProperties);
    expectRule('.settings-hub-layout', paperPatternProperties);
    expectRule('.settings-section-content', ['background: transparent;']);
    expectRule('.settings-section-sidebar', [
      'border: 0;',
      'border-right: 1px solid hsl(var(--border) / 0.72);',
      'background: transparent;',
    ]);
    expectRule('.settings-section-nav-item.is-active', ['background: transparent;']);
  });

  it('separates the narrow settings nav underline from its divider', () => {
    expect(styles).toContain('padding: 28px 18px 0;');
    expectRule('.settings-section-nav', [
      'width: max-content;',
      'max-width: 100%;',
      'padding: 0 0 7px;',
    ]);
    expectRule('.settings-section-nav::before', [
      'inset: auto 0 0;',
      'height: 1px;',
      'background: hsl(var(--border) / 0.7);',
    ]);
    expectRule('.settings-section-nav-item::after', ['inset: auto 12px 3px;']);
  });

  it('keeps agent taglines underlined per wrapped line', () => {
    expectRule('.agent-list-heading blockquote', [
      'text-decoration-line: underline;',
      'text-decoration-style: wavy;',
      'text-decoration-color:',
    ]);
    expect(styles).not.toContain('.agent-list-heading blockquote::after');
  });
});
