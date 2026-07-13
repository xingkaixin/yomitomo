import { describe, expect, it } from 'vitest';
import { readRendererStyles } from './css-test-utils';

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

describe('app shell header styles', () => {
  it('keeps the persistent app header within one compact row', () => {
    expectRule('.app-shell', ['grid-template-rows: 64px minmax(0, 1fr);']);
    expectRule('.app-masthead', [
      'display: flex;',
      'min-height: 64px;',
      'align-items: center;',
      '-webkit-app-region: drag;',
    ]);
    expectRule('.app-section-nav', ['height: 100%;', 'flex: 1;', '-webkit-app-region: drag;']);
  });

  it('keeps header controls usable inside the draggable region', () => {
    expectRule('.app-masthead-wordmark', ['height: 44px;', '-webkit-app-region: no-drag;']);
    expectRule('.app-section-nav button', ['-webkit-app-region: no-drag;']);
    expectRule('.app-nav-lock-button', ['width: 44px;', 'height: 44px;']);
    expectRule('.app-nav-theme-button', ['width: 44px;', 'height: 44px;']);
    expectRule('.app-nav-profile-button', ['width: 44px;', 'height: 44px;']);
  });

  it('does not restore the old masthead-only metadata rows', () => {
    expect(styles).not.toContain('.app-masthead-date');
    expect(styles).not.toContain('.app-masthead-phonetic');
  });
});
