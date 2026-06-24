import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../components/landing/LandingMasthead.astro', import.meta.url),
  'utf8',
);

describe('landing masthead source', () => {
  it('uses navigation menu semantics for language links', () => {
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('role="menu"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain('aria-current={!isEnglish ?');
    expect(source).toContain('aria-current={isEnglish ?');
    expect(source).toContain('tabindex="-1"');
    expect(source).not.toContain('aria-haspopup="listbox"');
    expect(source).not.toContain('role="listbox"');
    expect(source).not.toContain('role="option"');
    expect(source).not.toContain('aria-selected=');
  });

  it('handles language menu keyboard focus and selection paths', () => {
    expect(source).toContain("['Enter', ' ', 'ArrowDown', 'ArrowUp']");
    expect(source).toContain("event.key === 'Home'");
    expect(source).toContain("event.key === 'End'");
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("event.key === 'Tab'");
    expect(source).toContain('focusCurrentMenuItem');
    expect(source).toContain('closeMenu({ restoreFocus: true })');
    expect(source).toContain('document.activeElement instanceof HTMLElement');
  });

  it('manages mobile drawer visibility and focus recovery', () => {
    expect(source).toContain("document.getElementById('starlight__sidebar')");
    expect(source).toContain('focusFirstDrawerControl');
    expect(source).toContain('data-mobile-menu-visible');
    expect(source).toContain('data-mobile-menu-closing');
    expect(source).toContain('setTocOpen(false, { restoreFocus: true })');
    expect(source).toContain("getMotionMs('--panel-close-dur', 350)");
  });
});
