import { readFileSync } from 'node:fs';

const localCssImportPattern = /@import\s+['"](?<path>\.[^'"]+\.css)['"];\s*/g;

export function readExpandedCss(entry: URL): string {
  const css = readFileSync(entry, 'utf8');

  return css.replace(localCssImportPattern, (_match, importPath: string) =>
    readExpandedCss(new URL(importPath, entry)),
  );
}

export function readRendererStyles(): string {
  return readExpandedCss(new URL('../styles.css', import.meta.url));
}
