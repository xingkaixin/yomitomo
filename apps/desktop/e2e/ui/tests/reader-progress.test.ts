import type { Page } from 'playwright-core';
import { describe, it } from 'vitest';
import { createTextFixture } from '../../helpers/e2e-data';
import { withDesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
  waitForLibraryArticle,
} from '../helpers/library';

const progressTitle = 'RD-793 Reading Progress';
const progressAuthor = 'Yomitomo E2E';
const targetProgressPercent = 35;

describe('reader progress', () => {
  it('keeps non-zero reading progress after returning to the library and reopening', async () => {
    await withDesktopE2eApp('reader-progress', async ({ fixtureDir, page }) => {
      const fixture = await createTextFixture(fixtureDir, {
        content: longProgressArticle(),
        fileName: 'rd-793-reading-progress.md',
      });

      await openLibraryHome(page);
      await importTextFileThroughLibraryUi(page, fixture.path, {
        author: progressAuthor,
        title: progressTitle,
      });
      await waitForLibraryArticle(page, progressTitle);

      await openReaderArticle(page, progressTitle);
      await scrollReaderSurfaceToProgress(page, 0.55);
      await waitForReaderProgress(page, targetProgressPercent);

      await page.getByRole('button', { name: 'Back to library' }).click();
      await waitForLibraryArticle(page, progressTitle);
      await waitForLibraryCardProgress(page, progressTitle, targetProgressPercent);

      await openReaderArticle(page, progressTitle);
      await waitForReaderProgress(page, targetProgressPercent);
    });
  });
});

async function openReaderArticle(page: Page, title: string) {
  await libraryArticleButton(page, title).click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
  await page.locator('.reader-toolbar').getByText(title, { exact: true }).waitFor({
    timeout: 15_000,
  });
}

async function scrollReaderSurfaceToProgress(page: Page, targetProgress: number) {
  await page.evaluate((progress) => {
    const surface = document.querySelector<HTMLElement>('.reader-surface');
    if (!surface) throw new Error('READER_SURFACE_UNAVAILABLE');

    const maxScrollTop = surface.scrollHeight - surface.clientHeight;
    if (maxScrollTop <= 0) throw new Error('READER_SURFACE_NOT_SCROLLABLE');

    surface.scrollTo({
      behavior: 'auto',
      top: Math.round(maxScrollTop * progress),
    });
    surface.dispatchEvent(new Event('scroll'));
  }, targetProgress);
}

async function waitForReaderProgress(page: Page, minPercent: number) {
  await page.waitForFunction(
    (minimum) => {
      const progressbar = document.querySelector<HTMLElement>(
        '[role="progressbar"][aria-label="Reading progress"]',
      );
      const value = Number(progressbar?.getAttribute('aria-valuenow'));
      return Number.isFinite(value) && value >= minimum;
    },
    minPercent,
    { timeout: 15_000 },
  );
}

async function waitForLibraryCardProgress(page: Page, title: string, minPercent: number) {
  await page.waitForFunction(
    ({ minimum, openLabel }) => {
      const openButton = Array.from(document.querySelectorAll('button[aria-label]')).find(
        (button) => button.getAttribute('aria-label') === openLabel,
      );
      const card = openButton?.closest('article');
      const progress = card?.querySelector<HTMLElement>('.library-cover-progress');
      const value = Number.parseFloat(progress?.style.getPropertyValue('--ebook-progress') || '');
      return Number.isFinite(value) && value >= minimum;
    },
    {
      minimum: minPercent,
      openLabel: `Open article: ${title}`,
    },
    { timeout: 15_000 },
  );
}

function longProgressArticle() {
  const paragraphs = Array.from(
    { length: 72 },
    (_, index) =>
      `Progress paragraph ${index + 1}. This fixture keeps the reader surface scrollable so the desktop UI can save and restore a non-zero reading progress value.`,
  );

  return `---
title: ${progressTitle}
author: ${progressAuthor}
---

# Progress Entry

${paragraphs.join('\n\n')}
`;
}
