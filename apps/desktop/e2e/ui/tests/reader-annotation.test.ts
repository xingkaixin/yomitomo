import type { Page } from 'playwright-core';
import { describe, it } from 'vitest';
import { createTextFixture } from '../../helpers/e2e-data';
import type { DesktopApiForE2e } from '../helpers/desktop-api';
import { withDesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
  waitForLibraryArticle,
} from '../helpers/library';

const annotationTitle = 'RD-792 Annotation Path';
const annotationAuthor = 'Yomitomo E2E';
const annotationQuote = 'Reader annotation E2E selects this stable sentence.';

describe('reader annotation', () => {
  it('keeps a highlight and a thought created with an inline-image avatar', async () => {
    await withDesktopE2eApp('reader-annotation', async ({ app, fixtureDir, page }) => {
      const fixture = await createTextFixture(fixtureDir, {
        content: `---
title: ${annotationTitle}
author: ${annotationAuthor}
---

# Annotation Entry

${annotationQuote}

This second sentence keeps the article body long enough for the reader surface.
`,
        fileName: 'rd-792-annotation-path.md',
      });

      await openLibraryHome(page);
      await importTextFileThroughLibraryUi(page, fixture.path, {
        author: annotationAuthor,
        title: annotationTitle,
      });
      await waitForLibraryArticle(page, annotationTitle);

      await openReaderArticle(page, annotationTitle);
      await selectReaderQuote(page, annotationQuote);
      await page
        .locator('.reader-selection-menu')
        .getByRole('button', { name: /Record thought/ })
        .click();
      await page.locator('.reader-composer').getByRole('button', { name: 'Highlight' }).click();
      await waitForReaderAnnotation(page, annotationQuote);

      await page.getByRole('button', { name: 'Back to library' }).click();
      await waitForLibraryArticle(page, annotationTitle);
      await openReaderArticle(page, annotationTitle);
      await waitForReaderAnnotation(page, annotationQuote);

      await page.evaluate(async () => {
        const desktop = (window as Window & { yomitomoDesktop?: DesktopApiForE2e }).yomitomoDesktop;
        if (!desktop) throw new Error('YOMITOMO_DESKTOP_API_UNAVAILABLE');
        await desktop.store.saveUser({
          avatar: `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg"><desc>${'A'.repeat(5000)}</desc></svg>`,
          )}`,
        });
      });

      const discussionWindowPromise = app.waitForEvent('window');
      await page.getByRole('button', { name: 'Open discussion' }).click();
      const discussionPage = await discussionWindowPromise;
      await discussionPage.getByRole('button', { name: 'Add thought' }).click();
      const addThoughtDialog = discussionPage.locator('.annotation-discussion-add-modal');
      await addThoughtDialog
        .getByRole('textbox', { name: 'Thought content' })
        .fill('Saved thought');
      await addThoughtDialog.getByRole('button', { name: 'Add', exact: true }).click();
      await discussionPage
        .locator('.annotation-discussion-idea-list')
        .getByText('Saved thought', { exact: true })
        .waitFor({ timeout: 15_000 });
      await discussionPage.close();
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

async function selectReaderQuote(page: Page, quote: string) {
  await page.evaluate((selectedQuote) => {
    const article = document.querySelector<HTMLElement>('.reader-article');
    const surface = document.querySelector<HTMLElement>('.reader-surface');
    if (!article || !surface) throw new Error('READER_SELECTION_SURFACE_UNAVAILABLE');

    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    let startOffset = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      startOffset = node.data.indexOf(selectedQuote);
      if (startOffset >= 0) {
        textNode = node;
        break;
      }
    }
    if (!textNode) throw new Error(`READER_SELECTION_TEXT_NOT_FOUND: ${selectedQuote}`);

    const range = document.createRange();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, startOffset + selectedQuote.length);
    const selection = window.getSelection();
    if (!selection) throw new Error('READER_SELECTION_UNAVAILABLE');
    selection.removeAllRanges();
    selection.addRange(range);

    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] || range.getBoundingClientRect();
    surface.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        clientX: Math.max(rect.left, rect.right - 1),
        clientY: Math.max(rect.top, rect.bottom - 1),
        view: window,
      }),
    );
  }, quote);

  await page.locator('.reader-selection-menu').waitFor({ timeout: 15_000 });
}

async function waitForReaderAnnotation(page: Page, quote: string) {
  await page.locator('.reader-note-quote-text').getByText(quote, { exact: true }).waitFor({
    timeout: 15_000,
  });
  await page.locator('.reader-highlight:not(.is-temporary):not(.is-search)').first().waitFor({
    timeout: 15_000,
  });
}
