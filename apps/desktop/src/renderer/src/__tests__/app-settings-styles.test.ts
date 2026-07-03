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

  it('defines the shared popup surface motion contract', () => {
    expect(styles).toContain('--dropdown-open-dur: 190ms;');
    expect(styles).toContain('--dropdown-close-dur: 120ms;');
    expectRule('.ui-popup-content.t-dropdown', [
      'transform-origin: var(--transform-origin, var(--popup-transform-origin, top left));',
      'opacity: 0;',
      'will-change: transform, opacity;',
    ]);
    expectRule('.ui-popup-content.t-dropdown[data-open]', [
      'transform: scale(1);',
      'opacity: 1;',
      'pointer-events: auto;',
    ]);
    expectRule('.ui-popup-content.t-dropdown[data-starting-style]', [
      'transform: scale(var(--dropdown-pre-scale));',
      'opacity: 0;',
    ]);
    expectRule('.ui-popup-content.t-dropdown[data-ending-style]', [
      'transform: scale(var(--dropdown-closing-scale));',
      'var(--dropdown-close-dur)',
    ]);
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ui-popup-content\.t-dropdown,[\s\S]*transform: none;[\s\S]*transition: none;/,
    );
  });

  it('does not default stagger high-frequency popup menu items', () => {
    expect(styles).not.toContain('menu-item-stagger-in');
    expect(styles).not.toContain('animation: menu-item-stagger-in');
  });

  it('keeps the license dialog clickable over draggable window chrome', () => {
    expectRule('.license-dialog-overlay', ['-webkit-app-region: no-drag;']);
    expectRule('.license-dialog', ['-webkit-app-region: no-drag;']);
    expectRule('.license-dialog *', ['-webkit-app-region: no-drag;']);
  });

  it('keeps app shell responsive rules outside legacy overrides', () => {
    expect(styles).toMatch(
      /@media \(max-width: 980px\) \{[\s\S]*\.app-layout \{[\s\S]*grid-template-columns: 128px minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.app-window-header \{[\s\S]*padding-left: 66px;[\s\S]*\.app-header-date \{[\s\S]*display: none;[\s\S]*\.app-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*\.settings-sidebar \{[\s\S]*border-right: 0;[\s\S]*border-bottom: 1px solid hsl\(var\(--border\) \/ 0\.72\);[\s\S]*\.settings-nav \{[\s\S]*display: flex;[\s\S]*overflow-x: auto;[\s\S]*\.sidebar-note,[\s\S]*\.sidebar-profile-button \{[\s\S]*display: none;/,
    );
  });
});
