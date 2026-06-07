import { copyFile, readFile } from 'node:fs/promises';
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
