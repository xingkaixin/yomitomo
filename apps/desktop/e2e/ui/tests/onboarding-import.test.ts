import { join } from 'node:path';
import { describe, it } from 'vitest';
import { createTinyEpubFixture } from '../../helpers/e2e-data';
import { withDesktopE2eApp, resizeDesktopContent } from '../helpers/electron-app';
import type { DesktopApiForE2e } from '../helpers/desktop-api';
import { libraryDocumentButton, waitForLibraryDocument } from '../helpers/library';

describe('first reading task', () => {
  it('opens EPUB import from onboarding and reaches the reader without a model', async () => {
    await withDesktopE2eApp('onboarding-import', async (desktop) => {
      const { page, fixtureDir, artifactsDir } = desktop;
      await page.evaluate(async () => {
        const api = (window as Window & { yomitomoDesktop?: DesktopApiForE2e }).yomitomoDesktop;
        if (!api) throw new Error('Desktop API unavailable');
        await api.store.saveSettings({ uiLanguage: 'en' });
      });
      await page.reload();
      await page.getByRole('heading', { name: 'Read a passage. Save a thought.' }).waitFor();
      await resizeDesktopContent(desktop, { width: 1024, height: 720 });
      await page.screenshot({ path: join(artifactsDir, 'onboarding-import.png') });
      await page.getByRole('button', { name: 'Import EPUB', exact: true }).click();
      const fixture = await createTinyEpubFixture(fixtureDir, {
        title: 'First reading',
        creator: 'Yomitomo E2E',
        chapterText: 'A first passage to read and remember.',
        fileName: 'first-reading.epub',
      });
      await page.locator('#library-ebook-file').setInputFiles(fixture.path);
      await page.locator('.library-import-dialog').waitFor({ state: 'detached' });
      await waitForLibraryDocument(page, 'First reading', 'Ebook');
      await libraryDocumentButton(page, 'First reading', 'Ebook').click();
      await page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor();
    });
  });
});
