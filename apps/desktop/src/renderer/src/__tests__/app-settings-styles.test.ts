import { readRendererStyles } from './css-test-utils';
import { describe, expect, it } from 'vitest';

const styles = readRendererStyles();

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
    expectRule('.agent-list-motto', [
      'text-decoration-line: underline;',
      'text-decoration-style: wavy;',
      'text-decoration-color:',
    ]);
    expect(styles).not.toContain('.agent-list-motto::after');
  });

  it('keeps task route provider selectors at a stable width', () => {
    expectRule('.task-route-select-trigger', ['width: 248px;', 'max-width: 100%;']);
    expectRule('.provider-select-content', ['width: min(340px, calc(100vw - 32px));']);
  });

  it('keeps floating menus clickable over draggable window chrome', () => {
    expectRule('.ui-select-content', ['-webkit-app-region: no-drag;']);
    expectRule('.ui-select-content *', ['-webkit-app-region: no-drag;']);
    expectRule('.ui-popover-content', ['-webkit-app-region: no-drag;']);
    expectRule('.ui-popover-content *', ['-webkit-app-region: no-drag;']);
  });

  it('keeps the license dialog clickable over draggable window chrome', () => {
    expectRule('.license-dialog-overlay', ['-webkit-app-region: no-drag;']);
    expectRule('.license-dialog', ['-webkit-app-region: no-drag;']);
    expectRule('.license-dialog *', ['-webkit-app-region: no-drag;']);
  });
});
