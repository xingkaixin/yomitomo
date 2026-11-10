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

const ebookTitle = 'Reader Chat Shortcut EPUB';
const ebookChapterText = 'Clicking this sentence moves keyboard focus into the EPUB section.';

describe('ebook reader chat shortcut', () => {
  it('opens and collapses reader chat with Q while focus is in the EPUB body', async () => {
    const runData = await createE2eRunData('ebook-reader-chat-shortcut');
    let desktopApp: DesktopE2eApp | undefined;

    try {
      const fixture = await createTinyEpubFixture(runData.fixtureDir, {
        chapterText: ebookChapterText,
        creator: 'Yomitomo E2E',
        fileName: 'reader-chat-shortcut.epub',
        title: ebookTitle,
      });

      desktopApp = await launchDesktopE2eApp('ebook-reader-chat-shortcut', {
        cleanupOnClose: false,
        runData,
      });
      const { page } = desktopApp;
      await openLibraryHome(page);
      await importEbookFileThroughLibraryUi(page, fixture.path);
      await waitForLibraryDocument(page, ebookTitle, 'Ebook');
      await libraryDocumentButton(page, ebookTitle, 'Ebook').click();
      await page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor({
        timeout: 15_000,
      });
      await page.getByText('1 / 1', { exact: true }).waitFor({ timeout: 15_000 });

      const openChatPanel = page.locator('.reader-chat-panel[data-open="true"]');

      await clickEbookBodyText(page);
      await page.keyboard.press('q');
      await openChatPanel.waitFor({ timeout: 5_000 });

      // Opening the panel focuses its textarea; clicking the body moves focus back into the EPUB.
      await clickEbookBodyText(page);
      await page.keyboard.press('q');
      await openChatPanel.waitFor({ state: 'detached', timeout: 5_000 });
    } catch (error) {
      await desktopApp?.captureFailure('failure').catch(() => undefined);
      throw error;
    } finally {
      await desktopApp?.close().catch(() => undefined);
      await cleanupE2eData(runData);
    }
  });
});

async function clickEbookBodyText(page: Page) {
  for (const frame of page.frames()) {
    const text = frame.getByText(ebookChapterText, { exact: true });
    if ((await text.count()) === 0) continue;
    await text.click();
    return;
  }
  throw new Error('EPUB section frame with the chapter text was not found');
}
