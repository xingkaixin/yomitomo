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

describe('desktop interaction styles', () => {
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

  it('keeps header controls clickable over draggable window chrome', () => {
    expectRule('.app-masthead-wordmark', ['-webkit-app-region: no-drag;']);
    expectRule('.app-section-nav button', ['-webkit-app-region: no-drag;']);
    expectRule('.weread-bookcase-header button', ['-webkit-app-region: no-drag;']);
  });

  it('disables popup and tab movement for reduced motion', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ui-popup-content\.t-dropdown,[\s\S]*transform: none;[\s\S]*transition: none;/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.segmented-control-indicator \{[^}]*transition: none !important;/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.shimmering-text::before \{[^}]*animation: none !important;/,
    );
  });
});
