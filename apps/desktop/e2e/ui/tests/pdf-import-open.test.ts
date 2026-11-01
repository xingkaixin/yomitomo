import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { cleanupE2eData, createE2eRunData, createTinyPdfFixture } from '../../helpers/e2e-data';
import {
  launchDesktopE2eApp,
  withDesktopE2eApp,
  type DesktopE2eApp,
} from '../helpers/electron-app';
import {
  importPdfFileThroughLibraryUi,
  libraryDocumentButton,
  openLibraryHome,
  waitForLibraryDocument,
} from '../helpers/library';
import { openRelationSource, selectRelationQuote } from '../helpers/reading-relations-fixtures';

const pdfTitle = 'RD-797 PDF Path';

describe('pdf import and open', () => {
  it('imports a PDF, opens and searches it, and keeps it after restart', async () => {
    const runData = await createE2eRunData('pdf-import-open');
    let firstApp: DesktopE2eApp | undefined;
    let restartedApp: DesktopE2eApp | undefined;

    try {
      const fixture = await createTinyPdfFixture(runData.fixtureDir, {
        fileName: `${pdfTitle}.pdf`,
        title: 'RD-797 PDF page text appears after opening the reader.',
      });

      firstApp = await launchDesktopE2eApp('pdf-import-open-first-run', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(firstApp.page);
      await importPdfFileThroughLibraryUi(firstApp.page, fixture.path);
      await waitForLibraryDocument(firstApp.page, pdfTitle, 'PDF');

      await openReaderDocument(firstApp.page, pdfTitle);
      await waitForPdfReaderReady(firstApp.page);
      await firstApp.page.getByRole('button', { name: 'Search body', exact: true }).click();
      await firstApp.page
        .getByRole('searchbox', { name: 'Search body', exact: true })
        .fill('page text appears');
      await firstApp.page.waitForFunction(
        () =>
          document.querySelector('.reader-floating-value.is-search-count')?.textContent === '1/1',
      );
      await firstApp.page
        .getByRole('searchbox', { name: 'Search body', exact: true })
        .press('Escape');
      await firstApp.page.getByRole('button', { name: 'Back to library' }).click();
      await waitForLibraryDocument(firstApp.page, pdfTitle, 'PDF');

      await firstApp.close();
      firstApp = undefined;

      restartedApp = await launchDesktopE2eApp('pdf-import-open-restart', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(restartedApp.page);
      await waitForLibraryDocument(restartedApp.page, pdfTitle, 'PDF');
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

  it('opens at the top of the first page with a highlight near the page top visible', async () => {
    await withDesktopE2eApp('pdf-open-top-highlight', async ({ fixtureDir, page }) => {
      const source = {
        kind: 'pdf' as const,
        title: 'PDF open keeps page top',
        quote: 'A highlight near the top of the page stays visible',
      };
      // A tall page: the auto zoom has to leave room to scroll for it to shift the first page.
      const fixture = await createTinyPdfFixture(fixtureDir, {
        fileName: `${source.title}.pdf`,
        title: source.quote,
        pageHeight: 792,
        pageWidth: 600,
      });
      await openLibraryHome(page);
      await importPdfFileThroughLibraryUi(page, fixture.path);
      await waitForLibraryDocument(page, source.title, 'PDF');

      await openRelationSource(page, source);
      await expectPdfAutoZoomedAtPageTop(page);
      await selectRelationQuote(page, source);
      await page
        .locator('.reader-selection-menu')
        .getByRole('button', { name: /Record thought/ })
        .click();
      await page.locator('.reader-composer').getByRole('button', { name: 'Highlight' }).click();
      await page.locator('.reader-note').waitFor();
      await page.getByRole('button', { name: 'Back to library' }).click();
      await waitForLibraryDocument(page, source.title, 'PDF');

      await openRelationSource(page, source);
      await expectPdfAutoZoomedAtPageTop(page);
      await page.locator('.reader-note').waitFor();
      await page.locator('.reader-highlight').waitFor();
    });
  });
});

async function expectPdfAutoZoomedAtPageTop(page: Page) {
  await page.waitForFunction(() => {
    const pageShell = document.querySelector('[data-pdfium-page-index="0"]');
    return (pageShell?.getBoundingClientRect().width ?? 0) > 600;
  });
  const scrollTop = await page
    .locator('.pdfium-spike-viewport')
    .evaluate((viewport) => viewport.scrollTop);
  expect(scrollTop).toBe(0);
}

async function openReaderDocument(page: Page, title: string) {
  await libraryDocumentButton(page, title, 'PDF').click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 20_000 });
  await page.locator('.reader-toolbar-article-title').getByText(title, { exact: true }).waitFor({
    timeout: 20_000,
  });
}

async function waitForPdfReaderReady(page: Page) {
  await page.locator('.source-pdf-reader-shell .source-pdfium-spike-reader').waitFor({
    timeout: 30_000,
  });
  await page.locator('.source-pdf-reader-shell .pdfium-spike-canvas').waitFor({
    timeout: 30_000,
  });
  await page
    .locator('.source-pdf-reader-shell [data-pdfium-page-index="0"]')
    .waitFor({ timeout: 30_000 });
  await page.getByRole('slider', { name: 'Jump to PDF page' }).waitFor({ timeout: 30_000 });
  await page.getByText('1 / 1', { exact: true }).waitFor({ timeout: 30_000 });
}
