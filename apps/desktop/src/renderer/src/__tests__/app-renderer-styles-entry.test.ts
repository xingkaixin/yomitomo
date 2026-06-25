import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRendererStyles } from './css-test-utils';

const entryStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const settingsStyles = readFileSync(new URL('../styles/settings.css', import.meta.url), 'utf8');
const annotationDiscussionStyles = readFileSync(
  new URL('../styles/annotation-discussion.css', import.meta.url),
  'utf8',
);
const libraryStyles = readFileSync(new URL('../styles/library.css', import.meta.url), 'utf8');
const themeOverridesStyles = readFileSync(
  new URL('../styles/theme-overrides.css', import.meta.url),
  'utf8',
);

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

  it('keeps settings styles as ordered partial imports', () => {
    expect(settingsStyles.trim()).toBe(`@import './settings/base-panels.css';
@import './settings/provider-cards.css';
@import './settings/provider-models.css';
@import './settings/agent-library.css';
@import './settings/provider-editor.css';
@import './settings/agent-profile-dialogs.css';
@import './settings/forms-actions.css';
@import './settings/weread-bookcase.css';
@import './settings/provider-select-responsive.css';
@import './settings/stats-overview.css';
@import './settings/weread-stats.css';
@import './settings/logs-and-secrets.css';
@import './settings/profile-customization.css';
@import './settings/data-diagnostics.css';
@import './settings/trace-license.css';
@import './settings/onboarding.css';`);
  });

  it('keeps annotation discussion styles as ordered partial imports', () => {
    expect(annotationDiscussionStyles.trim()).toBe(`@import './annotation-discussion/window.css';
@import './annotation-discussion/ideas.css';
@import './annotation-discussion/thread.css';
@import './annotation-discussion/add-run.css';
@import './annotation-discussion/composer.css';
@import './annotation-discussion/sedimentation.css';
@import './annotation-discussion/shared.css';`);
  });

  it('keeps library styles as ordered partial imports', () => {
    expect(libraryStyles.trim()).toBe(`@import './library/shell.css';
@import './library/home-import.css';
@import './library/filters.css';
@import './library/cards.css';
@import './library/bookcase.css';
@import './library/covers.css';
@import './library/actions-empty.css';
@import './library/notebook.css';`);
  });

  it('keeps theme override styles as ordered partial imports', () => {
    expect(themeOverridesStyles.trim()).toBe(`@import './theme-overrides/foundation.css';
@import './theme-overrides/legacy-shell.css';
@import './theme-overrides/legacy-library.css';
@import './theme-overrides/masthead-lock.css';
@import './theme-overrides/theme-dialog.css';
@import './theme-overrides/library-skeleton.css';
@import './theme-overrides/library-layout.css';
@import './theme-overrides/library-import.css';
@import './theme-overrides/reader-open-library.css';
@import './theme-overrides/library-collections.css';
@import './theme-overrides/article-import-tweaks.css';
@import './theme-overrides/settings-agent-stats.css';
@import './theme-overrides/library-import-theme.css';
@import './theme-overrides/responsive-overrides.css';`);
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
