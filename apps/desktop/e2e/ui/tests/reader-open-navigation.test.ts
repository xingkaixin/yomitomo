import { describe, it } from 'vitest';
import { createTextFixture } from '../../helpers/e2e-data';
import { withDesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
  waitForLibraryArticle,
} from '../helpers/library';

const readerTitle = 'RD-791 Reader Path';
const readerAuthor = 'Yomitomo E2E';
const readerParagraph = 'Reader E2E verifies opening local content and returning to the library.';

describe('reader open navigation', () => {
  it('opens an imported text item in the reader and returns to the library', async () => {
    await withDesktopE2eApp('reader-open-navigation', async ({ fixtureDir, page }) => {
      const fixture = await createTextFixture(fixtureDir, {
        content: `---
title: ${readerTitle}
author: ${readerAuthor}
---

# Reader Entry

${readerParagraph}
`,
        fileName: 'rd-791-reader-path.md',
      });

      await openLibraryHome(page);
      await importTextFileThroughLibraryUi(page, fixture.path, {
        author: readerAuthor,
        title: readerTitle,
      });
      await waitForLibraryArticle(page, readerTitle);

      await libraryArticleButton(page, readerTitle).click();
      await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
      await page.getByRole('progressbar', { name: 'Reading progress' }).waitFor({
        timeout: 15_000,
      });
      await page.locator('.reader-toolbar').getByText(readerTitle, { exact: true }).waitFor({
        timeout: 15_000,
      });
      await page.getByText(readerParagraph, { exact: true }).waitFor({ timeout: 15_000 });

      await page.getByRole('button', { name: 'Back to library' }).click();
      await page.getByRole('button', { name: 'Add content' }).waitFor({ timeout: 15_000 });
      await waitForLibraryArticle(page, readerTitle);
    });
  });
});
