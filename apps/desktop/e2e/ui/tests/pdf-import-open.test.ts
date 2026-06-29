import type { Page } from 'playwright-core';
import { describe, it } from 'vitest';
import { cleanupE2eData, createE2eRunData, createTinyPdfFixture } from '../../helpers/e2e-data';
import { launchDesktopE2eApp, type DesktopE2eApp } from '../helpers/electron-app';
import {
  importPdfFileThroughLibraryUi,
  libraryDocumentButton,
  openLibraryHome,
  waitForLibraryDocument,
} from '../helpers/library';

const pdfTitle = 'RD-797 PDF Path';

describe('pdf import and open', () => {
  it('imports a PDF through the UI, opens it, and keeps it after restart', async () => {
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
});

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
