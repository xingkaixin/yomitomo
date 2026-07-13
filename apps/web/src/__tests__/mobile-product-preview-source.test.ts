import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  new URL('../components/ReaderLandingPage.astro', import.meta.url),
  'utf8',
);
const previewSource = readFileSync(
  new URL('../components/landing/MobileProductPreview.astro', import.meta.url),
  'utf8',
);
const demoSource = readFileSync(
  new URL('../components/landing/DemoSection.astro', import.meta.url),
  'utf8',
);
const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

describe('mobile product preview source', () => {
  it('places the static preview before the interactive demo', () => {
    expect(pageSource.indexOf('<MobileProductPreview')).toBeLessThan(
      pageSource.indexOf('<DemoSection'),
    );
  });

  it('uses localized, dimensioned, lazy-loaded product screenshots', () => {
    expect(previewSource).toContain("'/assets/en-reader-1600.webp'");
    expect(previewSource).toContain("'/assets/cn-reader-1600.webp'");
    expect(previewSource.match(/width="1600"/g)).toHaveLength(2);
    expect(previewSource.match(/height="1032"/g)).toHaveLength(2);
    expect(previewSource.match(/loading="lazy"/g)).toHaveLength(2);
    expect(previewSource).not.toContain('client:');
  });

  it('keeps the full reader demo behind visibility hydration', () => {
    expect(demoSource).toContain('<ReaderDemo lang={lang} client:visible />');
  });

  it('swaps the static preview and interactive demo at the mobile breakpoint', () => {
    expect(landingStyles).toContain('.mobile-product-preview {\n  display: none;');

    const mobileStyles = landingStyles.slice(landingStyles.indexOf('@media (max-width: 800px)'));
    expect(mobileStyles).toContain('.demo-section {\n    display: none;');
    expect(mobileStyles).toContain('.mobile-product-preview {\n    display: block;');
  });
});
