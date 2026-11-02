import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import LandingMasthead from '../components/landing/LandingMasthead.astro';

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

async function renderMasthead() {
  const html = await container.renderToString(LandingMasthead, {
    props: { lang: 'zh-CN' },
    request: new Request('https://yomitomo.app/docs/'),
  });
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    url: 'https://yomitomo.app/docs/',
    beforeParse(window) {
      window.matchMedia = () => ({ matches: true }) as MediaQueryList;
      window.requestAnimationFrame = (callback) => {
        callback(0);
        return 1;
      };
    },
  });
}

describe('landing masthead interactions', () => {
  it('opens the language menu from the keyboard and supports focus navigation', async () => {
    const dom = await renderMasthead();
    const { document, KeyboardEvent } = dom.window;
    const trigger = document.querySelector<HTMLButtonElement>('[data-lang-trigger]')!;
    const menu = document.querySelector<HTMLElement>('[data-lang-menu]')!;
    const items = Array.from(menu.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'));

    trigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.getAttribute('aria-hidden')).toBe('false');
    expect(document.activeElement).toBe(items[0]);

    menu.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    expect(document.activeElement).toBe(items[2]);

    menu.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    expect(document.activeElement).toBe(items[0]);

    menu.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(trigger);
    dom.window.close();
  });
});
