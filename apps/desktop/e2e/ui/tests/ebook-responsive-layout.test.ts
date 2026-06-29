import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { createTinyEpubFixture } from '../../helpers/e2e-data';
import {
  resizeDesktopContent,
  type DesktopContentSize,
  type DesktopE2eApp,
  withDesktopE2eApp,
} from '../helpers/electron-app';
import { assertNoOverlap, assertVisibleBox, type E2eElementBox } from '../helpers/layout';
import {
  importEbookFileThroughLibraryUi,
  libraryDocumentButton,
  openLibraryHome,
  waitForLibraryDocument,
} from '../helpers/library';

const ebookTitle = 'RD-800 EPUB Responsive Reader';
const ebookAuthor = 'Yomitomo E2E';
const readerSettingsStorageKey = 'yomitomo.desktop.readerSettings';
const responsiveReaderSettings = {
  backgroundColor: '#fffdf8',
  contentWidth: 600,
  fontSize: 18,
};

describe('ebook responsive layout', () => {
  it('switches between spread and single-page EPUB layouts after real window resize', async () => {
    await withResponsiveEbookFixture(async (desktopApp) => {
      await openEbookReader(desktopApp.page, ebookTitle);

      await resizeAndAssertEbookLayout(desktopApp, {
        expectedSpread: true,
        maxStageWidth: 1_260,
        minStageWidth: 1_080,
        name: 'wide-spread',
        size: { height: 860, width: 1_640 },
      });

      await resizeAndAssertEbookLayout(desktopApp, {
        expectedSpread: false,
        maxStageWidth: 720,
        minStageWidth: 560,
        name: 'compact-single',
        size: { height: 700, width: 1_000 },
      });

      await resizeAndAssertEbookLayout(desktopApp, {
        expectedSpread: true,
        maxStageWidth: 1_260,
        minStageWidth: 1_080,
        name: 'wide-spread-restored',
        size: { height: 820, width: 1_640 },
      });
    });
  });
});

type EbookResizeExpectation = {
  expectedSpread: boolean;
  maxStageWidth: number;
  minStageWidth: number;
  name: string;
  size: DesktopContentSize;
};

type EbookLayoutSnapshot = {
  documentOverflowsX: boolean;
  isSpread: boolean;
  pageLabel: string;
  shellClass: string;
  stageHeight: number;
  stageWidth: number;
  viewport: DesktopContentSize;
};

async function withResponsiveEbookFixture(
  run: (desktopApp: DesktopE2eApp) => Promise<void>,
): Promise<void> {
  await withDesktopE2eApp('ebook-responsive-layout', async (desktopApp) => {
    const fixture = await createTinyEpubFixture(desktopApp.fixtureDir, {
      chapterText: ebookChapterText(),
      creator: ebookAuthor,
      fileName: 'rd-800-epub-responsive.epub',
      title: ebookTitle,
    });

    await openLibraryHome(desktopApp.page);
    await setReaderSettings(desktopApp.page);
    await importEbookFileThroughLibraryUi(desktopApp.page, fixture.path);
    await waitForLibraryDocument(desktopApp.page, ebookTitle, 'Ebook');

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

async function openEbookReader(page: Page, title: string) {
  await libraryDocumentButton(page, title, 'Ebook').click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
  await page.locator('.reader-toolbar-article-title').getByText(title, { exact: true }).waitFor({
    timeout: 15_000,
  });
  await waitForEbookReaderReady(page);
}

async function resizeAndAssertEbookLayout(
  desktopApp: DesktopE2eApp,
  expectation: EbookResizeExpectation,
) {
  const result = await resizeDesktopContent(desktopApp, expectation.size, { settleMs: 220 });
  expectSizeNear(result.viewportSize, expectation.size);

  const snapshot = await waitForEbookPaginationQuiet(
    desktopApp.page,
    expectation.expectedSpread,
    expectation.name,
  );
  expect(
    snapshot.documentOverflowsX,
    `${expectation.name} overflow ${JSON.stringify(snapshot)}`,
  ).toBe(false);

  const toolbarBox = await assertVisibleBox(desktopApp.page.locator('.reader-toolbar'), {
    minHeight: 64,
    minWidth: 700,
  });
  const mainBox = await assertVisibleBox(desktopApp.page.locator('.reader-main'), {
    minHeight: 560,
    minWidth: 900,
  });
  const stageBox = await assertVisibleBox(
    desktopApp.page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready'),
    {
      minHeight: 460,
      minWidth: expectation.minStageWidth,
    },
  );
  expect(stageBox.width, `${expectation.name} stage width`).toBeLessThanOrEqual(
    expectation.maxStageWidth,
  );
  await assertVisibleBox(desktopApp.page.locator('.ebook-foliate-frame .ebook-foliate-view'), {
    minHeight: 430,
    minWidth: expectation.minStageWidth,
  });
  await assertVisibleBox(desktopApp.page.getByRole('button', { name: 'Back to library' }), {
    minHeight: 32,
    minWidth: 32,
  });
  await assertVisibleBox(desktopApp.page.getByRole('progressbar', { name: 'Reading progress' }), {
    minHeight: 2,
    minWidth: 80,
  });
  await assertVisibleBox(desktopApp.page.locator('.ebook-progress-slider'), {
    minHeight: 10,
    minWidth: 80,
  });

  assertBoxInsideViewport(toolbarBox, result.viewportSize, `${expectation.name} toolbar`);
  assertBoxInsideViewport(mainBox, result.viewportSize, `${expectation.name} main`);
  assertBoxInsideViewport(stageBox, result.viewportSize, `${expectation.name} stage`);
  await assertNoOverlap(
    desktopApp.page.locator('.reader-toolbar'),
    desktopApp.page.locator('.reader-main'),
    { tolerance: 1 },
  );
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
}

async function waitForEbookPaginationQuiet(
  page: Page,
  expectedSpread: boolean,
  label: string,
): Promise<EbookLayoutSnapshot> {
  await page.waitForFunction(
    (spread) => {
      const shell = document.querySelector('.source-ebook-reader-shell');
      if (!shell) return false;
      return spread
        ? shell.classList.contains('is-ebook-spread')
        : !shell.classList.contains('is-ebook-spread');
    },
    expectedSpread,
    { timeout: 15_000 },
  );
  await page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor({
    timeout: 15_000,
  });
  await page.locator('.ebook-foliate-frame .ebook-foliate-view').waitFor({
    timeout: 15_000,
  });
  await page.locator('.reader-floating-control-group:not(.is-paginating)').waitFor({
    timeout: 15_000,
  });
  await page
    .locator('.reader-floating-value.is-wide:not(.is-paginating)')
    .getByText(/\d+\s\/\s\d+/)
    .waitFor({ timeout: 15_000 });

  let previous = await readEbookLayoutSnapshot(page);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForTimeout(250);
    const next = await readEbookLayoutSnapshot(page);
    if (sameEbookLayoutSnapshot(previous, next)) return next;
    previous = next;
  }
  throw new Error(`EPUB pagination did not settle for ${label}: ${JSON.stringify(previous)}`);
}

async function readEbookLayoutSnapshot(page: Page): Promise<EbookLayoutSnapshot> {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.source-ebook-reader-shell');
    const stage = document.querySelector<HTMLElement>('.ebook-page-stage');
    const pageLabel = document.querySelector<HTMLElement>(
      '.reader-floating-value.is-wide:not(.is-paginating)',
    );
    if (!shell || !stage || !pageLabel) throw new Error('EBOOK_LAYOUT_SNAPSHOT_UNAVAILABLE');

    const stageBox = stage.getBoundingClientRect();
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    );
    return {
      documentOverflowsX: documentWidth > window.innerWidth + 2,
      isSpread: shell.classList.contains('is-ebook-spread'),
      pageLabel: pageLabel.textContent?.trim() ?? '',
      shellClass: shell.className,
      stageHeight: Math.round(stageBox.height),
      stageWidth: Math.round(stageBox.width),
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  });
}

function sameEbookLayoutSnapshot(left: EbookLayoutSnapshot, right: EbookLayoutSnapshot) {
  return (
    left.documentOverflowsX === right.documentOverflowsX &&
    left.isSpread === right.isSpread &&
    left.pageLabel === right.pageLabel &&
    left.stageHeight === right.stageHeight &&
    left.stageWidth === right.stageWidth &&
    left.viewport.height === right.viewport.height &&
    left.viewport.width === right.viewport.width
  );
}

function assertBoxInsideViewport(box: E2eElementBox, viewport: DesktopContentSize, label: string) {
  expect(box.left, `${label} left`).toBeGreaterThanOrEqual(-2);
  expect(box.top, `${label} top`).toBeGreaterThanOrEqual(-2);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(viewport.width + 2);
  expect(box.bottom, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 2);
}

function expectSizeNear(actual: DesktopContentSize, expected: DesktopContentSize) {
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(2);
}

function ebookChapterText() {
  return Array.from(
    { length: 42 },
    (_, index) =>
      `RD-800 responsive EPUB paragraph ${index + 1} keeps pagination deterministic across spread and single-page resize checks.`,
  ).join(' ');
}
