import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { createTinyPdfFixture } from '../../helpers/e2e-data';
import {
  resizeDesktopContent,
  type DesktopContentSize,
  type DesktopE2eApp,
  withDesktopE2eApp,
} from '../helpers/electron-app';
import { assertNoOverlap, assertVisibleBox, type E2eElementBox } from '../helpers/layout';
import {
  importPdfFileThroughLibraryUi,
  libraryDocumentButton,
  openLibraryHome,
  waitForLibraryDocument,
} from '../helpers/library';

const pdfTitle = 'RD-801 PDF Responsive Reader';

describe('pdf responsive layout', () => {
  it('keeps the PDF reader usable after real window resize', async () => {
    await withResponsivePdfFixture(async (desktopApp) => {
      await openPdfReader(desktopApp.page, pdfTitle);

      const wide = await resizeAndAssertPdfLayout(desktopApp, {
        maxPageWidth: 1_260,
        minPageWidth: 1_060,
        name: 'wide',
        size: { height: 860, width: 1_640 },
      });
      const medium = await resizeAndAssertPdfLayout(desktopApp, {
        maxPageWidth: 1_020,
        minPageWidth: 840,
        name: 'medium',
        size: { height: 760, width: 1_280 },
      });
      const compact = await resizeAndAssertPdfLayout(desktopApp, {
        maxPageWidth: 760,
        minPageWidth: 560,
        name: 'compact',
        size: { height: 700, width: 1_000 },
      });

      expect(wide.pageShellBox.width, 'wide page should be wider than medium').toBeGreaterThan(
        medium.pageShellBox.width + 120,
      );
      expect(medium.pageShellBox.width, 'medium page should be wider than compact').toBeGreaterThan(
        compact.pageShellBox.width + 120,
      );
    });
  });
});

type PdfResizeExpectation = {
  maxPageWidth: number;
  minPageWidth: number;
  name: string;
  size: DesktopContentSize;
};

type PdfLayoutSnapshot = {
  appClass: string;
  canvasBox: E2eElementBox;
  canvasOverflowsX: boolean;
  documentOverflowsX: boolean;
  mode: string;
  pageBox: E2eElementBox;
  pageLabel: string;
  pageShellBox: E2eElementBox;
  surfaceBox: E2eElementBox;
  surfaceOverflowsX: boolean;
  viewport: DesktopContentSize;
  viewportBox: E2eElementBox;
  viewportOverflowsX: boolean;
};

async function withResponsivePdfFixture(
  run: (desktopApp: DesktopE2eApp) => Promise<void>,
): Promise<void> {
  await withDesktopE2eApp('pdf-responsive-layout', async (desktopApp) => {
    const fixture = await createTinyPdfFixture(desktopApp.fixtureDir, {
      fileName: `${pdfTitle}.pdf`,
      pageHeight: 792,
      pageWidth: 612,
      title: 'RD-801 PDF page resizes with the desktop content window.',
    });

    await openLibraryHome(desktopApp.page);
    await importPdfFileThroughLibraryUi(desktopApp.page, fixture.path);
    await waitForLibraryDocument(desktopApp.page, pdfTitle, 'PDF');

    await run(desktopApp);
  });
}

async function openPdfReader(page: Page, title: string) {
  await libraryDocumentButton(page, title, 'PDF').click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 20_000 });
  await page.locator('.reader-toolbar-article-title').getByText(title, { exact: true }).waitFor({
    timeout: 20_000,
  });
  await waitForPdfReaderReady(page);
}

async function resizeAndAssertPdfLayout(
  desktopApp: DesktopE2eApp,
  expectation: PdfResizeExpectation,
) {
  const result = await resizeDesktopContent(desktopApp, expectation.size, { settleMs: 220 });
  expectSizeNear(result.viewportSize, expectation.size);

  const snapshot = await waitForPdfLayoutQuiet(desktopApp.page, expectation.name);
  expect(
    snapshot.documentOverflowsX,
    `${expectation.name} document overflow ${JSON.stringify(snapshot)}`,
  ).toBe(false);
  expect(
    snapshot.surfaceOverflowsX,
    `${expectation.name} surface overflow ${JSON.stringify(snapshot)}`,
  ).toBe(false);
  expect(
    snapshot.canvasOverflowsX,
    `${expectation.name} canvas overflow ${JSON.stringify(snapshot)}`,
  ).toBe(false);
  expect(
    snapshot.viewportOverflowsX,
    `${expectation.name} viewport overflow ${JSON.stringify(snapshot)}`,
  ).toBe(false);
  expect(snapshot.pageLabel).toBe('1 / 1');
  expect(snapshot.mode, `${expectation.name} annotation mode`).not.toBe('unknown');
  expect(snapshot.pageShellBox.width, `${expectation.name} page width`).toBeGreaterThanOrEqual(
    expectation.minPageWidth,
  );
  expect(snapshot.pageShellBox.width, `${expectation.name} page width`).toBeLessThanOrEqual(
    expectation.maxPageWidth,
  );

  const toolbarBox = await assertVisibleBox(desktopApp.page.locator('.reader-toolbar'), {
    minHeight: 64,
    minWidth: 700,
  });
  const mainBox = await assertVisibleBox(desktopApp.page.locator('.reader-main'), {
    minHeight: 560,
    minWidth: 900,
  });
  const viewportBox = await assertVisibleBox(
    desktopApp.page.locator('.source-pdf-reader-shell .pdfium-spike-viewport'),
    {
      minHeight: 560,
      minWidth: 900,
    },
  );
  const pageShellBox = await assertVisibleBox(
    desktopApp.page.locator('.source-pdf-reader-shell [data-pdfium-page-index="0"]'),
    {
      minHeight: 700,
      minWidth: expectation.minPageWidth,
    },
  );
  await assertVisibleBox(desktopApp.page.locator('.source-pdf-reader-shell .pdfium-spike-canvas'), {
    minHeight: 560,
    minWidth: 900,
  });
  await assertVisibleBox(desktopApp.page.locator('.source-pdf-reader-shell .pdfium-spike-page'), {
    minHeight: 700,
    minWidth: expectation.minPageWidth,
  });
  await assertVisibleBox(desktopApp.page.getByRole('button', { name: 'Back to library' }), {
    minHeight: 32,
    minWidth: 32,
  });
  await assertVisibleBox(desktopApp.page.getByRole('progressbar', { name: 'Reading progress' }), {
    minHeight: 2,
    minWidth: 80,
  });
  await assertVisibleBox(desktopApp.page.getByRole('slider', { name: 'Jump to PDF page' }), {
    minHeight: 10,
    minWidth: 80,
  });

  assertBoxInsideViewport(toolbarBox, result.viewportSize, `${expectation.name} toolbar`);
  assertBoxInsideViewport(mainBox, result.viewportSize, `${expectation.name} main`);
  assertBoxInsideViewport(viewportBox, result.viewportSize, `${expectation.name} viewport`);
  assertBoxHorizontallyInsideBox(pageShellBox, viewportBox, `${expectation.name} page`);
  assertBoxVerticallyIntersects(pageShellBox, viewportBox, `${expectation.name} page`);
  await assertNoOverlap(
    desktopApp.page.locator('.reader-toolbar'),
    desktopApp.page.locator('.reader-main'),
    { tolerance: 1 },
  );
  await assertReaderRailDoesNotCoverPage(desktopApp.page);

  return snapshot;
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

async function waitForPdfLayoutQuiet(page: Page, label: string): Promise<PdfLayoutSnapshot> {
  await waitForPdfReaderReady(page);
  await page.locator('.source-pdfium-spike-reader.is-restoring-initial-page').waitFor({
    state: 'detached',
    timeout: 15_000,
  });
  await page.locator('.reader-floating-control-group').waitFor({ timeout: 15_000 });

  let previous = await readPdfLayoutSnapshot(page);
  for (let attempt = 0; attempt < 7; attempt += 1) {
    await page.waitForTimeout(250);
    const next = await readPdfLayoutSnapshot(page);
    if (samePdfLayoutSnapshot(previous, next)) return next;
    previous = next;
  }
  throw new Error(`PDF layout did not settle for ${label}: ${JSON.stringify(previous)}`);
}

async function readPdfLayoutSnapshot(page: Page): Promise<PdfLayoutSnapshot> {
  return page.evaluate(() => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright serializes this callback into the browser context.
    function requiredBox(element: Element | null, label: string) {
      if (!element) throw new Error(`PDF_LAYOUT_BOX_UNAVAILABLE:${label}`);
      const box = element.getBoundingClientRect();
      return {
        bottom: Math.round(box.bottom),
        height: Math.round(box.height),
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
        width: Math.round(box.width),
      };
    }

    const app = document.querySelector<HTMLElement>('.source-pdf-reader-shell .reader-app');
    const surface = document.querySelector<HTMLElement>('.source-pdf-reader-shell .reader-surface');
    const canvas = document.querySelector<HTMLElement>(
      '.source-pdf-reader-shell .pdfium-spike-canvas',
    );
    const viewport = document.querySelector<HTMLElement>(
      '.source-pdf-reader-shell .pdfium-spike-viewport',
    );
    const pageShell = document.querySelector<HTMLElement>(
      '.source-pdf-reader-shell [data-pdfium-page-index="0"]',
    );
    const pageElement = document.querySelector<HTMLElement>(
      '.source-pdf-reader-shell .pdfium-spike-page',
    );
    const pageLabel = document.querySelector<HTMLElement>(
      '.source-pdf-reader-shell .reader-floating-value.is-wide',
    );
    if (!app || !surface || !canvas || !viewport || !pageShell || !pageElement || !pageLabel) {
      throw new Error('PDF_LAYOUT_SNAPSHOT_UNAVAILABLE');
    }

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
      canvasBox: requiredBox(canvas, 'canvas'),
      canvasOverflowsX: canvas.scrollWidth > canvas.clientWidth + 2,
      documentOverflowsX: documentWidth > window.innerWidth + 2,
      mode,
      pageBox: requiredBox(pageElement, 'page'),
      pageLabel: pageLabel.textContent?.trim() ?? '',
      pageShellBox: requiredBox(pageShell, 'page-shell'),
      surfaceBox: requiredBox(surface, 'surface'),
      surfaceOverflowsX: surface.scrollWidth > surface.clientWidth + 2,
      viewport: { height: window.innerHeight, width: window.innerWidth },
      viewportBox: requiredBox(viewport, 'viewport'),
      viewportOverflowsX: viewport.scrollWidth > viewport.clientWidth + 2,
    };
  });
}

function samePdfLayoutSnapshot(left: PdfLayoutSnapshot, right: PdfLayoutSnapshot) {
  return (
    left.appClass === right.appClass &&
    sameBox(left.canvasBox, right.canvasBox) &&
    left.canvasOverflowsX === right.canvasOverflowsX &&
    left.documentOverflowsX === right.documentOverflowsX &&
    left.mode === right.mode &&
    sameBox(left.pageBox, right.pageBox) &&
    left.pageLabel === right.pageLabel &&
    sameBox(left.pageShellBox, right.pageShellBox) &&
    sameBox(left.surfaceBox, right.surfaceBox) &&
    left.surfaceOverflowsX === right.surfaceOverflowsX &&
    left.viewport.height === right.viewport.height &&
    left.viewport.width === right.viewport.width &&
    sameBox(left.viewportBox, right.viewportBox) &&
    left.viewportOverflowsX === right.viewportOverflowsX
  );
}

function sameBox(left: E2eElementBox, right: E2eElementBox) {
  return (
    left.bottom === right.bottom &&
    left.height === right.height &&
    left.left === right.left &&
    left.right === right.right &&
    left.top === right.top &&
    left.width === right.width
  );
}

async function assertReaderRailDoesNotCoverPage(page: Page) {
  const pageShell = page.locator('.source-pdf-reader-shell [data-pdfium-page-index="0"]');
  const emptyRail = page.locator(
    '.source-pdf-reader-shell .reader-annotation-rail > .reader-empty',
  );
  if (
    await emptyRail
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await assertNoOverlap(pageShell, emptyRail.first(), { tolerance: 4 });
  }

  const firstNote = page.locator('.source-pdf-reader-shell .reader-annotation-rail > .reader-note');
  if (
    await firstNote
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await assertNoOverlap(pageShell, firstNote.first(), { tolerance: 4 });
  }

  const toc = page.locator('.source-pdf-reader-shell .reader-toc');
  if (
    await toc
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await assertNoOverlap(pageShell, toc.first(), { tolerance: 4 });
  }
}

function assertBoxInsideViewport(box: E2eElementBox, viewport: DesktopContentSize, label: string) {
  expect(box.left, `${label} left`).toBeGreaterThanOrEqual(-2);
  expect(box.top, `${label} top`).toBeGreaterThanOrEqual(-2);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(viewport.width + 2);
  expect(box.bottom, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 2);
}

function assertBoxHorizontallyInsideBox(box: E2eElementBox, target: E2eElementBox, label: string) {
  expect(box.left, `${label} left`).toBeGreaterThanOrEqual(target.left - 2);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(target.right + 2);
}

function assertBoxVerticallyIntersects(box: E2eElementBox, target: E2eElementBox, label: string) {
  expect(box.top, `${label} top`).toBeLessThan(target.bottom - 120);
  expect(box.bottom, `${label} bottom`).toBeGreaterThan(target.top + 120);
}

function expectSizeNear(actual: DesktopContentSize, expected: DesktopContentSize) {
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(2);
}
