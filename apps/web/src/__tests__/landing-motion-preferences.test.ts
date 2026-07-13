import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

function mediaBlocks(query: string) {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    landingStyles.matchAll(
      new RegExp(`@media ${escapedQuery} \\{(?<body>(?:[^{}]|\\{[^{}]*\\})*)\\}`, 'g'),
    ),
  ).map((match) => match.groups?.body || '');
}

describe('landing motion preferences', () => {
  it('stops the download pulse for reduced motion', () => {
    const reducedMotionBlocks = mediaBlocks('(prefers-reduced-motion: reduce)');

    expect(
      reducedMotionBlocks.some((block) =>
        /\.dl-version \.pulse::after\s*\{[^}]*animation: none;/.test(block),
      ),
    ).toBe(true);
  });

  it('limits lifting hover states to precise hover pointers', () => {
    const hoverBlocks = mediaBlocks('(hover: hover) and (pointer: fine)');
    const transforms = [
      ['.btn-primary:hover', 'transform: translateY(-2px);'],
      ['.dl-card:hover', 'transform: translateY(-2px);'],
      ['.lp-footer .social:hover', 'transform: translateY(-1px);'],
    ] as const;

    expect(hoverBlocks).toHaveLength(1);
    for (const [selector, transform] of transforms) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(hoverBlocks[0]).toContain(`${selector} {`);
      expect(hoverBlocks[0]).toContain(transform);
      expect(
        landingStyles.match(new RegExp(`${escapedSelector} \\{[^}]*transform:`, 'g')),
      ).toHaveLength(1);
    }
  });
});
