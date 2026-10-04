import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');
const starlightStyles = readFileSync(new URL('../styles/starlight.css', import.meta.url), 'utf8');

function relativeLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastBetweenGrays(foreground: number, background: number) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (backgroundLuminance + 0.05) / (foregroundLuminance + 0.05);
}

function mediaBlocks(query: string) {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    landingStyles.matchAll(
      new RegExp(`@media ${escapedQuery} \\{(?<body>(?:[^{}]|\\{[^{}]*\\})*)\\}`, 'g'),
    ),
  ).map((match) => match.groups?.body || '');
}

describe('landing accessibility styles', () => {
  it('reveals the skip link only when keyboard focus reaches it', () => {
    expect(landingStyles).toMatch(/\.lp-skip-link \{[^}]*position: fixed;/s);
    expect(landingStyles).toMatch(
      /\.lp-skip-link:focus-visible \{[^}]*transform: translateY\(0\);/s,
    );
  });

  it('keeps the weakest text color readable on warm paper surfaces', () => {
    const lightness = Number(
      landingStyles.match(/--ink-3: hsl\(0 0% (?<lightness>[\d.]+)%\);/)?.groups?.lightness,
    );
    const gray = Math.round((lightness / 100) * 255);

    expect(contrastBetweenGrays(gray, 245)).toBeGreaterThanOrEqual(4.5);
  });

  it('stops the download pulse for reduced motion', () => {
    const reducedMotionBlocks = mediaBlocks('(prefers-reduced-motion: reduce)');

    expect(
      reducedMotionBlocks.some((block) =>
        /\.dl-version \.pulse::after\s*\{[^}]*animation: none;/.test(block),
      ),
    ).toBe(true);
  });

  it('disables modal scale motion for reduced motion users', () => {
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.dm-overlay,[\s\S]*\.dm-panel \{[\s\S]*transition: none !important;[\s\S]*\.dm-panel,[\s\S]*\.dm-overlay\[data-state='closing'\] \.dm-panel \{[\s\S]*transform: none;/,
    );
  });

  it('disables menu and drawer transitions for reduced motion', () => {
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.lang-menu,[\s\S]*\.drawer-overlay \{[\s\S]*transition: none !important;/,
    );
    expect(starlightStyles).toMatch(
      /@media \(max-width: 50rem\) and \(prefers-reduced-motion: reduce\) \{[\s\S]*\.sidebar-pane \{[\s\S]*transition: none !important;/,
    );
  });
});
