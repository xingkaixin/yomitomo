import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mastheadSource = readFileSync(
  new URL('../components/landing/LandingMasthead.astro', import.meta.url),
  'utf8',
);
const heroSource = readFileSync(
  new URL('../components/landing/HeroSection.astro', import.meta.url),
  'utf8',
);
const previewSource = readFileSync(
  new URL('../components/landing/MobileProductPreview.astro', import.meta.url),
  'utf8',
);
const stepsSource = readFileSync(
  new URL('../components/landing/StepsSection.astro', import.meta.url),
  'utf8',
);
const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

describe('landing evidence visual language', () => {
  it('removes literal newspaper metadata and graph-paper decoration', () => {
    expect(mastheadSource).not.toContain('mh-kicker');
    expect(mastheadSource).not.toContain('data-masthead-date');
    expect(landingStyles.match(/background-image:/g)).toBeNull();
    expect(landingStyles).not.toMatch(/\.mh-nav \{[^}]*double/s);
  });

  it('uses evidence anchors across the hero, product preview, and reading flow', () => {
    expect(heroSource).toContain('class="hand-ul"');
    expect(previewSource).toContain('class="mobile-preview-image"');
    expect(stepsSource).toContain('class="step-anchor"');
  });

  it('expresses the reading flow without numbered equal columns', () => {
    expect(stepsSource).toContain('class="lp-container concept-layout"');
    expect(stepsSource).toContain('class="concept-title-line"');
    expect(stepsSource).not.toContain('<br />');
    expect(stepsSource).not.toContain('step-no');
    expect(stepsSource).not.toContain("'01'");
    expect(landingStyles).toContain('grid-template-columns: 40px minmax(0, 1fr);');
    expect(landingStyles).toContain('.step:not(:last-child)::before');
  });

  it('gives the shared workspace feature an asymmetric layout', () => {
    expect(landingStyles).toContain('.feat:nth-child(3)');
    expect(landingStyles).toContain('grid-row: 1 / span 2;');
  });
});
