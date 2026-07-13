import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  new URL('../components/ReaderLandingPage.astro', import.meta.url),
  'utf8',
);
const demoSource = readFileSync(
  new URL('../components/landing/ReaderDemo.tsx', import.meta.url),
  'utf8',
);
const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

describe('landing content semantics', () => {
  it('provides a localized skip link to the single main landmark', () => {
    expect(pageSource).toContain("isEnglish ? 'Skip to main content' : '跳到主要内容'");
    expect(pageSource).toContain(
      '<a class="lp-skip-link" href="#main-content">{skipLinkLabel}</a>',
    );
    expect(pageSource.match(/<main\b/g)).toHaveLength(1);
    expect(pageSource).toContain('<main id="main-content" tabindex="-1">');
    expect(pageSource.indexOf('<LandingMasthead')).toBeLessThan(pageSource.indexOf('<main'));
    expect(pageSource.indexOf('</main>')).toBeLessThan(pageSource.indexOf('<LandingFooter'));
  });

  it('reveals the skip link only when keyboard focus reaches it', () => {
    expect(landingStyles).toMatch(/\.lp-skip-link \{[^}]*position: fixed;/s);
    expect(landingStyles).toMatch(
      /\.lp-skip-link:focus-visible \{[^}]*transform: translateY\(0\);/s,
    );
  });

  it('declares the intrinsic dimensions of every reader demo avatar', () => {
    expect(
      demoSource.match(/<img src=\{[^}]+\} alt="" width=\{384\} height=\{384\} \/>/g),
    ).toHaveLength(3);
  });
});
