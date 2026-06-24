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

describe('segmented control styles', () => {
  it('defines the shared tabs sliding motion contract', () => {
    expectRule('.segmented-control', [
      '--segmented-slide-dur: 250ms;',
      '--segmented-slide-ease: cubic-bezier(0.22, 1, 0.36, 1);',
      '--segmented-feedback-dur: 150ms;',
      '--segmented-feedback-ease: var(--segmented-slide-ease);',
      '--segmented-active-scale: 0.96;',
    ]);
    expectRule('.segmented-control-indicator', [
      'transition: transform var(--segmented-slide-dur) var(--segmented-slide-ease);',
      'will-change: transform;',
    ]);
    expect(rulesFor('.segmented-control-indicator').join('\n')).not.toContain(
      'background-color 150ms ease',
    );
    expect(rulesFor('.segmented-control-indicator').join('\n')).not.toContain(
      'box-shadow 150ms ease',
    );
    expectRule('.segmented-control-option:active:not(:disabled)', [
      'transform: scale(var(--segmented-active-scale));',
    ]);
  });

  it('stops indicator sliding for reduced motion while keeping color feedback', () => {
    const baseRuleIndex = styles.indexOf('.segmented-control-option:focus-visible');
    const reducedMotionRuleIndex = styles.indexOf(
      '@media (prefers-reduced-motion: reduce) {\n  .segmented-control-indicator',
    );

    expect(reducedMotionRuleIndex).toBeGreaterThan(baseRuleIndex);
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.segmented-control-indicator \{[\s\S]*transition: none !important;[\s\S]*will-change: auto;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.segmented-control-option \{[\s\S]*color var\(--segmented-feedback-dur\) var\(--segmented-feedback-ease\),[\s\S]*opacity var\(--segmented-feedback-dur\) var\(--segmented-feedback-ease\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.segmented-control-option:active:not\(:disabled\) \{[\s\S]*transform: none;[\s\S]*\}/,
    );
  });

  it('keeps usage overrides from redefining segmented motion', () => {
    const agentFilterRules = rulesFor('.agent-filter-tab');
    const statsSwitchRules = rulesFor('.stats-chart-switch .segmented-control-option');

    expect(agentFilterRules.length).toBeGreaterThan(0);
    expect(statsSwitchRules.length).toBeGreaterThan(0);
    expect(agentFilterRules.every((rule) => !rule.includes('transition:'))).toBe(true);
    expect(statsSwitchRules.every((rule) => !rule.includes('transition:'))).toBe(true);
    expect(rulesFor('.agent-filter-tab:active')).toEqual([]);
    expect(rulesFor('.stats-chart-switch .segmented-control-option:active')).toEqual([]);
  });
});
