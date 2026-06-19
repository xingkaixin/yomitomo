import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRendererStyles } from './css-test-utils';

const entryStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('renderer styles entry', () => {
  it('keeps styles.css as the ordered global CSS entry', () => {
    expect(entryStyles.trim()).toBe(`@import 'tailwindcss';
@import './styles/fonts.css';
@import './styles/base.css';
@import './styles/shell.css';
@import './styles/settings.css';
@import './styles/annotation-discussion.css';
@import './styles/library.css';
@import './styles/source-reader-shared.css';
@import './styles/source-reader.css';
@import './styles/source-ebook.css';
@import './styles/source-pdf.css';
@import './styles/theme-overrides.css';
@config "../../../tailwind.config.ts";`);
  });

  it('expands local CSS imports for style assertions', () => {
    const styles = readRendererStyles();

    expect(styles).toContain("@font-face {\n  font-family: 'JetBrains Mono';");
    expect(styles).toContain(
      "src: url('./assets/fonts/NotoSansSC-Regular.woff2') format('woff2');",
    );
    expect(styles).toContain(
      "--font-ui:\n      'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans SC', system-ui, -apple-system,\n      BlinkMacSystemFont, sans-serif;",
    );
    expect(styles).not.toContain("url('../assets/fonts/");
    expect(styles).toContain('.app-shell {');
    expect(styles).toContain('.annotation-discussion-window {');
    expect(styles).toContain('.source-pdf-reader-shell {');
  });
});
