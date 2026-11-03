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

      expect(images.length).toBeGreaterThan(0);
      for (const image of images) {
        const path = image.getAttribute('src')!;
        expect(existsSync(new URL(`../../public${path}`, import.meta.url)), path).toBe(true);
      }
    },
  );
});
