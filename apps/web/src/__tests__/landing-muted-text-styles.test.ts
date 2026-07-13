import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return landingStyles.match(new RegExp(`${escapedSelector} \\{(?<body>[^}]+)\\}`))?.groups?.body;
}

function relativeLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastBetweenGrays(foreground: number, background: number) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (backgroundLuminance + 0.05) / (foregroundLuminance + 0.05);
}

describe('landing muted text styles', () => {
  it('keeps the weakest text color readable on warm paper surfaces', () => {
    const lightness = Number(
      landingStyles.match(/--ink-3: hsl\(0 0% (?<lightness>[\d.]+)%\);/)?.groups?.lightness,
    );
    const gray = Math.round((lightness / 100) * 255);

    expect(contrastBetweenGrays(gray, 245)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    '.cta-alt .v',
    '.reader-eyebrow',
    '.rail-head',
    '.dm-divider',
    '.dl-card .ext',
    '.lp-footer .fine',
  ])('keeps %s metadata at a legible size', (selector) => {
    expect(ruleFor(selector)).toContain('font-size: 12px;');
  });
});
