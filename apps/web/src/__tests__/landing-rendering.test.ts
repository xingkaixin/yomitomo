import reactRenderer from '@astrojs/react/server.js';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ReaderLandingPage from '../components/ReaderLandingPage.astro';

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
  container.addServerRenderer({ renderer: reactRenderer });
  container.addClientRenderer({ name: '@astrojs/react', entrypoint: '@astrojs/react/client.js' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function renderLandingPage(lang: 'zh-CN' | 'en' | 'ja') {
  const html = await container.renderToString(ReaderLandingPage, {
    partial: false,
    props: { lang },
    request: new Request(`https://yomitomo.app/${lang === 'zh-CN' ? '' : `${lang}/`}`),
  });
  return new JSDOM(html).window.document;
}

describe('landing page rendering', () => {
  it.each(['zh-CN', 'en', 'ja'] as const)(
    'renders one deferred Umami tracker on the %s production landing page',
    async (lang) => {
      vi.stubEnv('PROD', true);

      const page = await renderLandingPage(lang);
      const trackers = page.head.querySelectorAll<HTMLScriptElement>('script[data-website-id]');

      expect(trackers).toHaveLength(1);
      expect(trackers[0].src).toBe('https://umami.xingkaixin.me/script.js');
      expect(trackers[0].dataset.websiteId).toBe('08d9ce5d-0cd7-403c-9947-5eba7cd04bb8');
      expect(trackers[0].defer).toBe(true);
      expect(trackers[0].type).not.toBe('module');
    },
  );

  it('omits Umami tracking in development', async () => {
    vi.stubEnv('PROD', false);

    const page = await renderLandingPage('zh-CN');

    expect(page.querySelector('script[data-website-id]')).toBeNull();
  });

  it.each([
    ['zh-CN', '跳到主要内容'],
    ['en', 'Skip to main content'],
    ['ja', 'メインコンテンツへ移動'],
  ] as const)('renders the %s skip link to the main landmark', async (lang, label) => {
    const page = await renderLandingPage(lang);
    const skipLink = page.querySelector<HTMLAnchorElement>('.lp-skip-link');
    const main = page.querySelector('main');

    expect(skipLink?.textContent).toBe(label);
    expect(skipLink?.getAttribute('href')).toBe('#main-content');
    expect(main?.id).toBe('main-content');
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(page.querySelectorAll('main')).toHaveLength(1);
  });

  it('renders dimensioned reader demo avatars', async () => {
    const page = await renderLandingPage('zh-CN');
    const avatars = page.querySelectorAll<HTMLImageElement>('.reader-rail img');

    expect(avatars.length).toBeGreaterThan(0);
    for (const avatar of avatars) {
      expect(avatar.width).toBe(96);
      expect(avatar.height).toBe(96);
    }
  });

  it.each([
    ['zh-CN', '简体中文'],
    ['en', 'English'],
    ['ja', '日本語'],
  ] as const)('renders the %s language menu semantics', async (lang, currentLabel) => {
    const page = await renderLandingPage(lang);
    const trigger = page.querySelector<HTMLButtonElement>('[data-lang-trigger]');
    const menu = page.querySelector<HTMLElement>('[data-lang-menu]');
    const items = page.querySelectorAll<HTMLAnchorElement>('[data-lang-menu] a');
    const currentItem = page.querySelector<HTMLAnchorElement>(
      '[data-lang-menu] [aria-current="true"]',
    );

    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.getAttribute('role')).toBe('menuitem');
      expect(item.getAttribute('tabindex')).toBe('-1');
    }
    expect(currentItem?.textContent).toContain(currentLabel);
  });

  it('renders the static mobile preview before the visibility-hydrated demo', async () => {
    const page = await renderLandingPage('en');
    const preview = page.querySelector<HTMLElement>('.mobile-product-preview');
    const image = preview?.querySelector<HTMLImageElement>('.mobile-preview-image');
    const demo = page.querySelector<HTMLElement>('.demo-section');
    const hydratedDemo = demo?.querySelector('astro-island[client="visible"]');

    expect(preview).toBeTruthy();
    expect(demo).toBeTruthy();
    expect(
      preview && demo
        ? Boolean(preview.compareDocumentPosition(demo) & preview.DOCUMENT_POSITION_FOLLOWING)
        : false,
    ).toBe(true);
    expect(image?.getAttribute('src')).toBe('/assets/en-reader-1600.webp');
    expect(image?.width).toBe(1600);
    expect(image?.height).toBe(1032);
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(hydratedDemo).toBeTruthy();
  });

  it('renders the evidence-led landing structure without obsolete decorations', async () => {
    const page = await renderLandingPage('zh-CN');

    expect(page.querySelector('.hand-ul')).toBeTruthy();
    expect(page.querySelector('.mobile-preview-image')).toBeTruthy();
    expect(page.querySelector('.step-anchor')).toBeTruthy();
    expect(page.querySelector('.concept-layout')).toBeTruthy();
    expect(page.querySelector('.concept-title-line')).toBeTruthy();
    expect(page.querySelector('.mh-kicker')).toBeNull();
    expect(page.querySelector('[data-masthead-date]')).toBeNull();
    expect(page.querySelector('.step-no')).toBeNull();
  });
});
