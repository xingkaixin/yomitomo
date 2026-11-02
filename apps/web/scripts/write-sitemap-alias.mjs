import { copyFile, readFile, rename, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const sitemapSource = join(distDir, 'sitemap-0.xml');
const sitemapTarget = join(distDir, 'sitemap.xml');

const sitemap = await readFile(sitemapSource, 'utf8');
const requiredUrls = [
  'https://yomitomo.app/',
  'https://yomitomo.app/docs/',
  'https://yomitomo.app/changelogs/v0-7-0/',
];

for (const url of requiredUrls) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) {
    throw new Error(`Generated sitemap is missing ${url}`);
  }
}

await copyFile(sitemapSource, sitemapTarget);

// Workers serves the nearest `404.html`, but Astro only emits that file name for the root page.
for (const locale of ['en', 'ja']) {
  await rename(join(distDir, locale, '404/index.html'), join(distDir, locale, '404.html'));
  await rmdir(join(distDir, locale, '404'));
}
