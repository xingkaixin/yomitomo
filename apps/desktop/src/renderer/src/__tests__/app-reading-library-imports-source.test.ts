import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../reading-library/app-reading-library-imports.tsx', import.meta.url),
  'utf8',
);

describe('reading library import source', () => {
  it('uses a normalized SVG path for import success checks', () => {
    expect(source).toContain('function LibraryImportSuccessCheck');
    expect(source).toContain('pathLength={1}');
    expect(source).toContain('className="library-article-import-result-icon"');
    expect(source).toContain('className="library-import-success-icon"');
    expect(source).not.toContain('  Check,');
  });
});
