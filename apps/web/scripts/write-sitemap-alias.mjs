import { readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const sitemapSource = join(distDir, 'sitemap-0.xml');
const sitemapTarget = join(distDir, 'sitemap.xml');

const rawSitemap = await readFile(sitemapSource, 'utf8');

// Exclude per-version changelog pages so crawl budget stays focused on landing, docs, and scenario guides.
const prunedSitemap = rawSitemap.replace(
  /<url><loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g,
  (entry, loc) => {
    if (/\/changelogs\/v\d/.test(loc)) return '';
    if (entry.includes('hreflang="x-default"')) return entry;
    const enAlternate = entry.match(
      /<xhtml:link rel="alternate" hreflang="en" href="([^"]+)"\s*\/>/,
    );
    if (!enAlternate) return entry;
    return entry.replace(
      /<\/url>$/,
      `<xhtml:link rel="alternate" hreflang="x-default" href="${enAlternate[1]}"/></url>`,
    );
  },
);

const requiredUrls = [
  'https://yomitomo.app/',
  'https://yomitomo.app/en/',
  'https://yomitomo.app/ja/',
  'https://yomitomo.app/docs/',
  'https://yomitomo.app/changelogs/',
];

for (const url of requiredUrls) {
  if (!prunedSitemap.includes(`<loc>${url}</loc>`)) {
    throw new Error(`Generated sitemap is missing ${url}`);
  }
}

if (/\/changelogs\/v\d/.test(prunedSitemap)) {
  throw new Error('Generated sitemap should exclude per-version changelog URLs');
}

if (!prunedSitemap.includes('hreflang="x-default"')) {
  throw new Error('Generated sitemap is missing hreflang="x-default" alternates');
}

await writeFile(sitemapSource, prunedSitemap, 'utf8');
await writeFile(sitemapTarget, prunedSitemap, 'utf8');

// Workers serves the nearest `404.html`, but Astro only emits that file name for the root page.
for (const locale of ['en', 'ja']) {
  await rename(join(distDir, locale, '404/index.html'), join(distDir, locale, '404.html'));
  await rmdir(join(distDir, locale, '404'));
}
