import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
const fontDirectory = new URL('../public/assets/fonts/', import.meta.url);
const outputDirectory = new URL('../.astro/web-fonts/', import.meta.url);

export async function prepareWebFonts() {
  const entries = await readdir(sourceDirectory, { recursive: true, withFileTypes: true });
  const sources = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.(?:astro|tsx?|jsx?|mdx?|json|css)$/.test(entry.name) &&
        !entry.parentPath.includes('__tests__'),
    )
    .map((entry) => join(entry.parentPath, entry.name));
  const contents = await Promise.all(sources.map((path) => readFile(path, 'utf8')));
  // Markdown typography and Starlight can generate punctuation absent from source text.
  const punctuation = Array.from({ length: 0x70 }, (_, index) =>
    String.fromCodePoint(0x2000 + index),
  ).join('');
  const text = [...new Set(contents.join('') + punctuation)].toSorted().join('');
  const fonts = (await readdir(fontDirectory)).filter((name) => name.endsWith('.woff2'));

  await mkdir(outputDirectory, { recursive: true });
  for (const name of fonts) {
    const source = await readFile(new URL(name, fontDirectory));
    const subset = await subsetFont(source, text, {
      targetFormat: 'woff2',
      preserveNameIds: [0, 13, 14],
    });
    await writeFile(new URL(name, outputDirectory), subset);
  }
}
