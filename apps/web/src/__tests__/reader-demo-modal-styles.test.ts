import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

function rulesFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    styles.matchAll(new RegExp(`${escapedSelector} \\{(?<body>[^}]+)\\}`, 'g')),
  ).map((match) => match.groups?.body || '');
}

function expectRule(selector: string, properties: string[]) {
  expect(
    rulesFor(selector).some((rule) => properties.every((property) => rule.includes(property))),
  ).toBe(true);
}

describe('reader demo modal styles', () => {
  it('uses modal motion tokens for the discussion overlay and panel', () => {
    expect(styles).toContain('--modal-open-dur: 250ms;');
    expect(styles).toContain('--modal-close-dur: 150ms;');
    expect(styles).toContain('--modal-scale: 0.96;');
    expect(styles).toContain('--modal-scale-close: 0.96;');
    expect(styles).toContain('--modal-ease: cubic-bezier(0.22, 1, 0.36, 1);');
    expectRule('.dm-overlay', [
      'opacity: 0;',
      'pointer-events: none;',
      'transition: opacity var(--modal-close-dur) var(--modal-ease);',
    ]);
    expectRule('.dm-panel', [
      'opacity: 0;',
      'transform: scale(var(--modal-scale));',
      'will-change: transform, opacity;',
    ]);
  });

  it('separates open and closing modal states', () => {
    expectRule(".dm-overlay[data-state='open']", [
      'opacity: 1;',
      'pointer-events: auto;',
      'transition: opacity var(--modal-open-dur) var(--modal-ease);',
    ]);
    expectRule(".dm-overlay[data-state='closing']", [
      'opacity: 0;',
      'pointer-events: none;',
      'transition: opacity var(--modal-close-dur) var(--modal-ease);',
    ]);
    expectRule(".dm-overlay[data-state='open'] .dm-panel", [
      'opacity: 1;',
      'transform: scale(1);',
      'pointer-events: auto;',
    ]);
    expectRule(".dm-overlay[data-state='closing'] .dm-panel", [
      'opacity: 0;',
      'transform: scale(var(--modal-scale-close));',
      'pointer-events: none;',
      'var(--modal-close-dur)',
    ]);
    expect(styles).not.toContain('.dm-overlay.open');
  });

  it('disables modal scale motion for reduced motion users', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.dm-overlay,[\s\S]*\.dm-panel \{[\s\S]*transition: none !important;[\s\S]*\.dm-panel,[\s\S]*\.dm-overlay\[data-state='closing'\] \.dm-panel \{[\s\S]*transform: none;/,
    );
  });
});
