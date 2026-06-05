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
  it('keeps function page panels on the app card surface', () => {
    expectRule('.settings-panel', ['background: hsl(var(--card));']);
    expect(rulesFor('.settings-panel').some((rule) => rule.includes('--app-paper-pattern'))).toBe(
      false,
    );
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
