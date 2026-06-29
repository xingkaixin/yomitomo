import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { createTextFixture } from '../../helpers/e2e-data';
import {
  resizeDesktopContent,
  type DesktopContentSize,
  type DesktopE2eApp,
  withDesktopE2eApp,
} from '../helpers/electron-app';
import { assertNoOverlap, assertVisibleBox, type E2eElementBox } from '../helpers/layout';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
  waitForLibraryArticle,
} from '../helpers/library';

const readerTitle = 'RD-799 Responsive Reader';
const readerAuthor = 'Yomitomo E2E';
const highlightQuote = 'RD-799 responsive layout keeps this highlight anchored beside the article.';
const compactMinimumWindowSize = { height: 700, width: 1_000 };
const readerSettingsStorageKey = 'yomitomo.desktop.readerSettings';
const responsiveReaderSettings = {
  backgroundColor: '#fffdf8',
  contentWidth: 600,
  fontSize: 20,
};

describe('reader responsive layout', () => {
  it('keeps the text reader usable while resizing between wide and compact windows', async () => {
    await withResponsiveReaderFixture(async (desktopApp) => {
      await openReaderArticle(desktopApp.page, readerTitle);
      await createReaderHighlight(desktopApp.page, highlightQuote);

      await resizeAndAssertReaderLayout(desktopApp, {
        expectedMode: 'both',
        minArticleWidth: 560,
        name: 'wide',
        size: { height: 860, width: 1_500 },
      });
      await toggleTocAndAssertUsable(desktopApp.page);

      await resizeAndAssertReaderLayout(desktopApp, {
        expectedMode: 'right',
        minArticleWidth: 560,
        name: 'medium',
        size: { height: 760, width: 1_180 },
      });

      await resizeAndAssertReaderLayout(desktopApp, {
        expectedMode: 'right',
        minArticleWidth: 520,
        name: 'compact',
        size: compactMinimumWindowSize,
      });
      await toggleTocAndAssertUsable(desktopApp.page);
    });
  });
});

type ReaderAnnotationMode = 'both' | 'right';

type ReaderResizeExpectation = {
  expectedMode: ReaderAnnotationMode;
  minArticleWidth: number;
  name: string;
  size: DesktopContentSize;
};

type ReaderLayoutSnapshot = {
  appClass: string;
  articleOverflowsX: boolean;
  documentOverflowsX: boolean;
  mode: string;
  surfaceOverflowsX: boolean;
  viewport: DesktopContentSize;
};

async function withResponsiveReaderFixture(
  run: (desktopApp: DesktopE2eApp) => Promise<void>,
): Promise<void> {
  await withDesktopE2eApp('reader-responsive-layout', async (desktopApp) => {
    const fixture = await createTextFixture(desktopApp.fixtureDir, {
      content: `---
title: ${readerTitle}
author: ${readerAuthor}
---

# Responsive Reader Entry

${highlightQuote}

The first section gives the responsive reader a stable paragraph near the top of the article.

## Layout Section

Reader responsive tests use deterministic local content so the Electron window resize path is the
only moving part in this scenario.

## Notes Section

The note rail should stay beside the article when there is enough room and the core reader controls
should remain reachable when the window returns to the current desktop minimum size.
`,
      fileName: 'rd-799-responsive-reader.md',
    });

    await openLibraryHome(desktopApp.page);
    await setReaderSettings(desktopApp.page);
    await importTextFileThroughLibraryUi(desktopApp.page, fixture.path, {
      author: readerAuthor,
      title: readerTitle,
    });
    await waitForLibraryArticle(desktopApp.page, readerTitle);

    await run(desktopApp);
  });
}

async function setReaderSettings(page: Page) {
  await page.evaluate(
    ({ settings, storageKey }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(settings));
    },
    { settings: responsiveReaderSettings, storageKey: readerSettingsStorageKey },
  );
}

async function openReaderArticle(page: Page, title: string) {
  await libraryArticleButton(page, title).click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
  await page.locator('.reader-toolbar-article-title').getByText(title, { exact: true }).waitFor({
    timeout: 15_000,
  });
  await page.locator('.reader-app.has-toc').waitFor({ timeout: 15_000 });
}

async function createReaderHighlight(page: Page, quote: string) {
  await selectReaderQuote(page, quote);
  await page
    .locator('.reader-selection-menu')
    .getByRole('button', { name: /Record thought/ })
    .click();
  await page.locator('.reader-composer').getByRole('button', { name: 'Highlight' }).click();
  await page.locator('.reader-note-quote-text').getByText(quote, { exact: true }).waitFor({
    timeout: 15_000,
  });
  await page.locator('.reader-highlight:not(.is-temporary):not(.is-search)').first().waitFor({
    timeout: 15_000,
  });
}

async function resizeAndAssertReaderLayout(
  desktopApp: DesktopE2eApp,
  expectation: ReaderResizeExpectation,
) {
  const result = await resizeDesktopContent(desktopApp, expectation.size, { settleMs: 180 });
  expectSizeNear(result.viewportSize, expectation.size);
  await waitForReaderAnnotationMode(desktopApp.page, expectation.expectedMode, expectation.name);

  const toolbarBox = await assertVisibleBox(desktopApp.page.locator('.reader-toolbar'), {
    minHeight: 64,
    minWidth: 700,
  });
  const mainBox = await assertVisibleBox(desktopApp.page.locator('.reader-main'), {
    minHeight: 560,
    minWidth: 900,
  });
  const surfaceBox = await assertVisibleBox(desktopApp.page.locator('.reader-surface'), {
    minHeight: 520,
    minWidth: 860,
  });
  const articleBox = await assertVisibleBox(desktopApp.page.locator('.reader-article'), {
    minHeight: 260,
    minWidth: expectation.minArticleWidth,
  });
  const noteBox = await assertVisibleBox(
    desktopApp.page.locator('.reader-annotation-rail .reader-note').first(),
    {
      minHeight: 120,
      minWidth: 200,
    },
  );

  await assertVisibleBox(desktopApp.page.getByRole('button', { name: 'Back to library' }), {
    minHeight: 32,
    minWidth: 32,
  });
  await assertVisibleBox(desktopApp.page.getByRole('progressbar', { name: 'Reading progress' }), {
    minHeight: 2,
    minWidth: 80,
  });
  await assertVisibleBox(desktopApp.page.locator('.reader-floating-toolbar'), {
    minHeight: 36,
    minWidth: 40,
  });

  assertBoxInsideViewport(toolbarBox, result.viewportSize, `${expectation.name} toolbar`);
  assertBoxInsideViewport(mainBox, result.viewportSize, `${expectation.name} main`);
  assertBoxInsideViewport(surfaceBox, result.viewportSize, `${expectation.name} surface`);
  assertBoxHorizontallyInsideViewport(
    articleBox,
    result.viewportSize,
    `${expectation.name} article`,
  );
  assertBoxVerticallyIntersects(articleBox, surfaceBox, `${expectation.name} article`);
  assertBoxInsideViewport(noteBox, result.viewportSize, `${expectation.name} note`);
  await assertNoOverlap(
    desktopApp.page.locator('.reader-toolbar'),
    desktopApp.page.locator('.reader-main'),
    {
      tolerance: 1,
    },
  );
  await assertNoOverlap(
    desktopApp.page.locator('.reader-article'),
    desktopApp.page.locator('.reader-annotation-rail .reader-note').first(),
    { tolerance: 4 },
  );

  const layout = await readReaderLayoutSnapshot(desktopApp.page);
  expect(
    layout.documentOverflowsX,
    `${expectation.name} document overflow ${JSON.stringify(layout)}`,
  ).toBe(false);
  expect(
    layout.surfaceOverflowsX,
    `${expectation.name} surface overflow ${JSON.stringify(layout)}`,
  ).toBe(false);
  expect(
    layout.articleOverflowsX,
    `${expectation.name} article overflow ${JSON.stringify(layout)}`,
  ).toBe(false);
}

async function toggleTocAndAssertUsable(page: Page) {
  const tocToggle = page.locator('.reader-toc-toggle');
  await assertVisibleBox(tocToggle, { minHeight: 28, minWidth: 28 });
  await tocToggle.click();
  const toc = page.locator('.reader-app.is-toc-open .reader-toc');
  const tocBox = await assertVisibleBox(toc, { minHeight: 260, minWidth: 240 });
  const viewport = await page.evaluate(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }));
  assertBoxInsideViewport(tocBox, viewport, 'toc');
  await tocToggle.click();
  await page.locator('.reader-app:not(.is-toc-open)').waitFor({ timeout: 10_000 });
}

async function waitForReaderAnnotationMode(
  page: Page,
  expectedMode: ReaderAnnotationMode,
  name: string,
) {
  try {
    await page.waitForFunction(
      (mode) => document.querySelector('.reader-app')?.classList.contains(`is-annotation-${mode}`),
      expectedMode,
      { timeout: 10_000 },
    );
  } catch (error) {
    const layout = await readReaderLayoutSnapshot(page).catch(() => null);
    throw new Error(
      `Reader layout did not enter ${expectedMode} mode for ${name}: ${JSON.stringify(layout)}`,
      { cause: error },
    );
  }
}

async function readReaderLayoutSnapshot(page: Page): Promise<ReaderLayoutSnapshot> {
  return page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.reader-app');
    const surface = document.querySelector<HTMLElement>('.reader-surface');
    const article = document.querySelector<HTMLElement>('.reader-article');
    if (!app || !surface || !article) throw new Error('READER_LAYOUT_SNAPSHOT_UNAVAILABLE');

    const mode = app.classList.contains('is-annotation-both')
      ? 'both'
      : app.classList.contains('is-annotation-right')
        ? 'right'
        : app.classList.contains('is-annotation-stacked')
          ? 'stacked'
          : 'unknown';
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    );
    return {
      appClass: app.className,
      articleOverflowsX: article.scrollWidth > article.clientWidth + 2,
      documentOverflowsX: documentWidth > window.innerWidth + 2,
      mode,
      surfaceOverflowsX: surface.scrollWidth > surface.clientWidth + 2,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
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

function assertBoxInsideViewport(box: E2eElementBox, viewport: DesktopContentSize, label: string) {
  assertBoxHorizontallyInsideViewport(box, viewport, label);
  expect(box.top, `${label} top`).toBeGreaterThanOrEqual(-2);
  expect(box.bottom, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 2);
}

function assertBoxHorizontallyInsideViewport(
  box: E2eElementBox,
  viewport: DesktopContentSize,
  label: string,
) {
  expect(box.left, `${label} left`).toBeGreaterThanOrEqual(-2);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(viewport.width + 2);
}

function assertBoxVerticallyIntersects(box: E2eElementBox, target: E2eElementBox, label: string) {
  expect(box.top, `${label} top`).toBeLessThan(target.bottom - 120);
  expect(box.bottom, `${label} bottom`).toBeGreaterThan(target.top + 120);
}

function expectSizeNear(actual: DesktopContentSize, expected: DesktopContentSize) {
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(2);
}
