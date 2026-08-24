import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landingStyles = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');

describe('landing design contract', () => {
  it('reveals the skip link only when keyboard focus reaches it', () => {
    expect(landingStyles).toMatch(/\.lp-skip-link \{[^}]*position: fixed;/s);
    expect(landingStyles).toMatch(
      /\.lp-skip-link:focus-visible \{[^}]*transform: translateY\(0\);/s,
    );
  });

  it('keeps the evidence-led reading flow and feature layout', () => {
    expect(landingStyles.match(/background-image:/g)).toBeNull();
    expect(landingStyles).not.toMatch(/\.mh-nav \{[^}]*double/s);
    expect(landingStyles).toContain('grid-template-columns: 40px minmax(0, 1fr);');
    expect(landingStyles).toContain('.step:not(:last-child)::before');
    expect(landingStyles).toContain('.feat:nth-child(3)');
    expect(landingStyles).toContain('grid-row: 1 / span 2;');
  });

  it('swaps the static preview and interactive demo at the mobile breakpoint', () => {
    expect(landingStyles).toContain('.mobile-product-preview {\n  display: none;');

    const mobileStyles = landingStyles.slice(landingStyles.indexOf('@media (max-width: 800px)'));
    expect(mobileStyles).toContain('.demo-section {\n    display: none;');
    expect(mobileStyles).toContain('.mobile-product-preview {\n    display: block;');
  });
});
