import { existsSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import ReaderLandingPage from '../components/ReaderLandingPage.astro';

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
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
    'only references images that exist on the %s landing page',
    async (lang) => {
      const page = await renderLandingPage(lang);
      const images = page.querySelectorAll<HTMLImageElement>('img[src^="/assets/"]');
      const sources = page.querySelectorAll<HTMLSourceElement>('source[srcset]');

      expect(images.length).toBeGreaterThan(0);
      for (const image of images) {
        const path = image.getAttribute('src')!;
        expect(existsSync(new URL(`../../public${path}`, import.meta.url)), path).toBe(true);
      }
      for (const source of sources) {
        const entries = source
          .getAttribute('srcset')!
          .split(',')
          .map((item) => item.trim().split(/\s+/)[0] ?? '')
          .filter((path) => path.startsWith('/assets/'));
        for (const path of entries) {
          expect(existsSync(new URL(`../../public${path}`, import.meta.url)), path).toBe(true);
        }
      }
    },
  );

  it.each(['zh-CN', 'en', 'ja'] as const)(
    'links the %s hero CTA directly to installer downloads and includes locale hints',
    async (lang) => {
      const page = await renderLandingPage(lang);
      const primary = page.querySelector<HTMLAnchorElement>('[data-hero-primary]');
      const alt = page.querySelector<HTMLAnchorElement>('[data-hero-alt]');

      expect(primary?.getAttribute('href')).toMatch(
        /^https:\/\/download\.yomitomo\.app\/releases\/download\/v.+\.dmg$/,
      );
      expect(alt?.getAttribute('href')).toMatch(
        /^https:\/\/download\.yomitomo\.app\/releases\/download\/v.+\.exe$/,
      );
      expect(page.querySelectorAll('[data-locale-hint]').length).toBe(2);
    },
  );
});
