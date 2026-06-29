import type { Page } from 'playwright-core';
import { describe, it } from 'vitest';
import { cleanupE2eData, createE2eRunData, createTextFixture } from '../../helpers/e2e-data';
import { launchDesktopE2eApp, type DesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
  waitForLibraryArticle,
} from '../helpers/library';

const settingsTitle = 'RD-794 Reader Settings';
const settingsAuthor = 'Yomitomo E2E';
const fontSizeIncreaseSteps = 3;

describe('reader settings', () => {
  it('persists reader font size after restarting the app', async () => {
    const runData = await createE2eRunData('reader-settings');
    let firstApp: DesktopE2eApp | undefined;
    let restartedApp: DesktopE2eApp | undefined;

    try {
      const fixture = await createTextFixture(runData.fixtureDir, {
        content: `---
title: ${settingsTitle}
author: ${settingsAuthor}
---

# Settings Entry

Reader settings E2E verifies that a font size change survives a desktop restart.
`,
        fileName: 'rd-794-reader-settings.md',
      });

      firstApp = await launchDesktopE2eApp('reader-settings-first-run', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(firstApp.page);
      await importTextFileThroughLibraryUi(firstApp.page, fixture.path, {
        author: settingsAuthor,
        title: settingsTitle,
      });
      await waitForLibraryArticle(firstApp.page, settingsTitle);

      await openReaderArticle(firstApp.page, settingsTitle);
      const initialFontSize = await readerArticleFontSize(firstApp.page);
      const expectedFontSize = initialFontSize + fontSizeIncreaseSteps;
      await increaseReaderFontSize(firstApp.page, fontSizeIncreaseSteps);
      await waitForReaderArticleFontSize(firstApp.page, expectedFontSize);

      await firstApp.close();
      firstApp = undefined;

      restartedApp = await launchDesktopE2eApp('reader-settings-restart', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(restartedApp.page);
      await waitForLibraryArticle(restartedApp.page, settingsTitle);
      await openReaderArticle(restartedApp.page, settingsTitle);
      await waitForReaderArticleFontSize(restartedApp.page, expectedFontSize);
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
  await libraryArticleButton(page, title).click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
  await page.locator('.reader-toolbar').getByText(title, { exact: true }).waitFor({
    timeout: 15_000,
  });
}

async function increaseReaderFontSize(page: Page, steps: number) {
  await page.getByRole('button', { name: 'Font size' }).click();
  const popover = page.locator('.reader-toolbar-popover');
  await popover.waitFor({ timeout: 5_000 });
  const increaseButton = popover.getByRole('button', { name: '增加Font size' });

  for (let index = 0; index < steps; index += 1) {
    await increaseButton.click();
  }
}

async function readerArticleFontSize(page: Page) {
  return page.evaluate(() => {
    const article = document.querySelector<HTMLElement>('.reader-article');
    if (!article) throw new Error('READER_ARTICLE_UNAVAILABLE');
    return Number.parseFloat(window.getComputedStyle(article).fontSize);
  });
}

async function waitForReaderArticleFontSize(page: Page, expectedFontSize: number) {
  await page.waitForFunction(
    (expected) => {
      const article = document.querySelector<HTMLElement>('.reader-article');
      if (!article) return false;

      const actual = Number.parseFloat(window.getComputedStyle(article).fontSize);
      return Number.isFinite(actual) && Math.abs(actual - expected) < 0.1;
    },
    expectedFontSize,
    { timeout: 15_000 },
  );
}
