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

  it('disables menu, floating header and sheet motion for reduced motion', () => {
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.lang-menu \{\s*transition: none !important;/,
    );
    expect(landingStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mh-float,\s*\.mh-float\[data-show\] \{\s*transition: none;/,
    );
    expect(starlightStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.docs-sheet\[open\] \{\s*animation: none;/,
    );
  });
});
