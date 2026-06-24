import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');
const starlightStyles = readFileSync(new URL('../styles/starlight.css', import.meta.url), 'utf8');

function rulesFor(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    source.matchAll(new RegExp(`${escapedSelector} \\{(?<body>[^}]+)\\}`, 'g')),
  ).map((match) => match.groups?.body || '');
}

function expectRule(source: string, selector: string, properties: string[]) {
  expect(
    rulesFor(source, selector).some((rule) =>
      properties.every((property) => rule.includes(property)),
    ),
  ).toBe(true);
}

describe('landing masthead styles', () => {
  it('keeps the language menu on dropdown motion tokens', () => {
    expect(landingStyles).toContain('--dropdown-open-dur: 250ms;');
    expect(landingStyles).toContain('--dropdown-close-dur: 150ms;');
    expect(landingStyles).toContain('--dropdown-pre-scale: 0.97;');
    expect(landingStyles).toContain('--dropdown-closing-scale: 0.99;');
    expectRule(landingStyles, '.lang-menu', [
      'transform: scale(var(--dropdown-pre-scale));',
      'pointer-events: none;',
      'will-change: transform, opacity;',
    ]);
    expectRule(landingStyles, '.lang-menu.is-open', [
      'opacity: 1;',
      'transform: scale(1);',
      'pointer-events: auto;',
    ]);
    expectRule(landingStyles, '.lang-menu.is-closing', [
      'transform: scale(var(--dropdown-closing-scale));',
      'transition:',
      'var(--dropdown-close-dur)',
    ]);
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.lang-menu,[\s\S]*\.drawer-overlay \{[\s\S]*transition: none !important;/,
    );
  });

  it('keeps the mobile drawer overlay animatable while hidden', () => {
    expectRule(landingStyles, '.drawer-overlay', [
      'opacity: 0;',
      'visibility: hidden;',
      'pointer-events: none;',
    ]);
    expect(rulesFor(landingStyles, '.drawer-overlay').join('\n')).not.toContain('display: none');
    expectRule(landingStyles, 'body[data-mobile-menu-visible] .drawer-overlay', [
      'visibility: visible;',
      'pointer-events: auto;',
      'visibility 0s;',
    ]);
    expectRule(landingStyles, 'body[data-mobile-menu-expanded] .drawer-overlay', [
      'opacity: 1;',
      'opacity var(--dropdown-open-dur)',
    ]);
  });

  it('keeps the Starlight drawer visible through its close transition', () => {
    expect(landingStyles).toContain('--panel-open-dur: 400ms;');
    expect(landingStyles).toContain('--panel-close-dur: 350ms;');
    expectRule(starlightStyles, 'body[data-mobile-menu-visible] .sidebar-pane', [
      '--sl-sidebar-visibility: visible;',
    ]);
    expectRule(starlightStyles, '.sidebar-pane', [
      '--panel-translate-y: 100%;',
      'opacity: 0;',
      'filter: blur(var(--panel-blur, 2px));',
      'pointer-events: none;',
      'will-change: transform, opacity, filter;',
    ]);
    expectRule(starlightStyles, 'body[data-mobile-menu-expanded] .sidebar-pane', [
      'opacity: 1;',
      'filter: blur(0);',
      'pointer-events: auto;',
      'transform: translateX(-50%) translateY(0);',
    ]);
    expect(starlightStyles).toMatch(
      /@media \(max-width: 50rem\) and \(prefers-reduced-motion: reduce\) \{[\s\S]*\.sidebar-pane \{[\s\S]*transition: none !important;/,
    );
  });
});
