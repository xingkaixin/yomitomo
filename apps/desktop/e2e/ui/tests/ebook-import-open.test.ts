import type { Page } from 'playwright-core';
import { describe, it } from 'vitest';
import { cleanupE2eData, createE2eRunData, createTinyEpubFixture } from '../../helpers/e2e-data';
import { launchDesktopE2eApp, type DesktopE2eApp } from '../helpers/electron-app';
import {
  importEbookFileThroughLibraryUi,
  libraryDocumentButton,
  openLibraryHome,
  waitForLibraryDocument,
} from '../helpers/library';

const ebookTitle = 'RD-796 EPUB Path';
const ebookAuthor = 'Yomitomo E2E';
const ebookChapterText = 'RD-796 EPUB chapter text appears after opening the reader.';

describe('ebook import and open', () => {
  it('imports an EPUB through the UI, opens it, and keeps it after restart', async () => {
    const runData = await createE2eRunData('ebook-import-open');
    let firstApp: DesktopE2eApp | undefined;
    let restartedApp: DesktopE2eApp | undefined;

    try {
      const fixture = await createTinyEpubFixture(runData.fixtureDir, {
        chapterText: ebookChapterText,
        creator: ebookAuthor,
        fileName: 'rd-796-epub-path.epub',
        title: ebookTitle,
      });

      firstApp = await launchDesktopE2eApp('ebook-import-open-first-run', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(firstApp.page);
      await importEbookFileThroughLibraryUi(firstApp.page, fixture.path);
      await waitForLibraryDocument(firstApp.page, ebookTitle, 'Ebook');
      await waitForLibraryDocumentAuthor(firstApp.page, ebookTitle, ebookAuthor);

      await openReaderArticle(firstApp.page, ebookTitle);
      await waitForEbookReaderReady(firstApp.page);
      await firstApp.page.getByRole('button', { name: 'Back to library' }).click();
      await waitForLibraryDocument(firstApp.page, ebookTitle, 'Ebook');

      await firstApp.close();
      firstApp = undefined;

      restartedApp = await launchDesktopE2eApp('ebook-import-open-restart', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(restartedApp.page);
      await waitForLibraryDocument(restartedApp.page, ebookTitle, 'Ebook');
      await waitForLibraryDocumentAuthor(restartedApp.page, ebookTitle, ebookAuthor);
    } catch (error) {
      await firstApp?.captureFailure('failure').catch(() => undefined);
      await restartedApp?.captureFailure('failure').catch(() => undefined);
      throw error;
    } finally {
      await restartedApp?.close().catch(() => undefined);
      await firstApp?.close().catch(() => undefined);
      await cleanupE2eData(runData);
    }
  });
});

async function openReaderArticle(page: Page, title: string) {
  await libraryDocumentButton(page, title, 'Ebook').click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
  await page.locator('.reader-toolbar-article-title').getByText(title, { exact: true }).waitFor({
    timeout: 15_000,
  });
}

async function waitForLibraryDocumentAuthor(page: Page, title: string, author: string) {
  await libraryDocumentButton(page, title, 'Ebook')
    .locator('xpath=ancestor::article')
    .locator('.library-card-author')
    .getByText(author, { exact: true })
    .waitFor({ timeout: 15_000 });
}

async function waitForEbookReaderReady(page: Page) {
  await page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor({
    timeout: 15_000,
  });
  await page.locator('.ebook-foliate-frame .ebook-foliate-view').waitFor({
    timeout: 15_000,
  });
  await page.getByRole('progressbar', { name: 'Reading progress' }).waitFor({
    timeout: 15_000,
  });
  await page.getByText('1 / 1', { exact: true }).waitFor({ timeout: 15_000 });
}
