import type { Frame, Page } from 'playwright-core';
import { expect } from 'vitest';
import type { YomitomoDesktopApi } from '../../../src/preload';
import {
  createTextFixture,
  createTinyEpubFixture,
  createTinyPdfFixture,
} from '../../helpers/e2e-data';
import {
  importEbookFileThroughLibraryUi,
  importPdfFileThroughLibraryUi,
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  libraryDocumentButton,
  openLibraryHome,
} from './library';
import { withDesktopE2eApp, type DesktopE2eApp } from './electron-app';

export type RelationSource = {
  kind: 'web' | 'ebook' | 'pdf';
  title: string;
  quote: string;
};

export async function withRelationDesktopApp(
  name: string,
  baseUrl: string,
  run: (app: DesktopE2eApp) => Promise<void>,
) {
  await withDesktopE2eApp(name, async (app) => {
    await openLibraryHome(app.page);
    const providerId = await configureRelationProvider(app.page, baseUrl);
    try {
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await app.page.getByRole('button', { name: 'Add content' }).waitFor();
      await run(app);
    } finally {
      await app.page.evaluate(async (id) => {
        const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
          .yomitomoDesktop;
        if (!desktop) throw new Error('RELATION_DESKTOP_API_UNAVAILABLE');
        await desktop.provider.delete(id);
      }, providerId);
    }
  });
}

export async function importRelationSource(page: Page, fixtureDir: string, source: RelationSource) {
  if (source.kind === 'ebook') {
    const fixture = await createTinyEpubFixture(fixtureDir, {
      chapterText: source.quote,
      fileName: `${source.title}.epub`,
      title: source.title,
    });
    await importEbookFileThroughLibraryUi(page, fixture.path);
  } else if (source.kind === 'pdf') {
    const fixture = await createTinyPdfFixture(fixtureDir, {
      fileName: `${source.title}.pdf`,
      title: source.quote,
      pageWidth: 600,
      pageHeight: 400,
    });
    await importPdfFileThroughLibraryUi(page, fixture.path);
  } else {
    const fixture = await createTextFixture(fixtureDir, {
      content: `# ${source.title}\n\n${source.quote}\n\nA saved reading passage for the relation test.`,
      fileName: `${source.title}.md`,
    });
    await importTextFileThroughLibraryUi(page, fixture.path, { title: source.title });
  }
}

export async function openRelationSource(page: Page, source: RelationSource) {
  const button =
    source.kind === 'web'
      ? libraryArticleButton(page, source.title)
      : libraryDocumentButton(page, source.title, source.kind === 'ebook' ? 'Ebook' : 'PDF');
  await button.click();
  await waitForRelationSource(page, source);
}

export async function waitForRelationSource(page: Page, source: RelationSource) {
  await page
    .locator('.reader-toolbar-article-title')
    .getByText(source.title, { exact: true })
    .waitFor();
  if (source.kind === 'ebook') {
    await page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor();
  } else if (source.kind === 'pdf') {
    await page.locator('.source-pdf-reader-shell .pdfium-spike-canvas').waitFor();
    await page.getByRole('slider', { name: 'Jump to PDF page' }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('.source-pdfium-spike-reader.is-restoring-initial-page'),
    );
  } else {
    await page.locator('.reader-article').getByText(source.quote, { exact: true }).waitFor();
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

export async function selectRelationQuote(page: Page, source: RelationSource) {
  if (source.kind === 'pdf') {
    const box = await page.locator('[data-pdfium-page-index="0"]').boundingBox();
    if (!box) throw new Error('RELATION_PDF_PAGE_UNAVAILABLE');
    const scale = box.width / 600;
    // The generated PDF places its single Helvetica line at (20, 320) on a 600 × 400 page.
    await page.mouse.move(box.x + 19 * scale, box.y + 75 * scale);
    await page.mouse.down();
    await page.mouse.move(box.x + 560 * scale, box.y + 75 * scale, { steps: 20 });
    await page.mouse.up();
  } else {
    const target = source.kind === 'ebook' ? await currentEbookFrame(page, source.quote) : page;
    await target.evaluate(
      ({ quote, ebook }) => {
        const root = ebook ? document.body : document.querySelector('.reader-article');
        const surface = ebook ? document : document.querySelector('.reader-surface');
        if (!root || !surface) throw new Error('RELATION_SELECTION_SURFACE_UNAVAILABLE');
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const start = node.data.indexOf(quote);
          if (start < 0) continue;
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + quote.length);
          const selection = window.getSelection();
          if (!selection) throw new Error('RELATION_SELECTION_UNAVAILABLE');
          selection.removeAllRanges();
          selection.addRange(range);
          const rect = range.getBoundingClientRect();
          surface.dispatchEvent(
            new MouseEvent('mouseup', {
              bubbles: true,
              clientX: rect.right - 1,
              clientY: rect.bottom - 1,
              view: window,
            }),
          );
          return;
        }
        throw new Error(`RELATION_SELECTION_TEXT_NOT_FOUND: ${quote}`);
      },
      { quote: source.quote, ebook: source.kind === 'ebook' },
    );
  }
  await page.locator('.reader-selection-menu').waitFor({ timeout: 10_000 });
}

export async function saveRelationJudgment(page: Page, source: RelationSource, thought: string) {
  await selectRelationQuote(page, source);
  await page
    .locator('.reader-selection-menu')
    .getByRole('button', { name: /Record thought/ })
    .click();
  await page.locator('.reader-composer').getByRole('button', { name: 'Highlight' }).click();
  await page.locator('.reader-note-quote-text').getByText(source.quote, { exact: true }).waitFor();
  await page.locator('.reader-composer').waitFor({ state: 'detached' });
  return page.evaluate(
    async ({ title, content }) => {
      const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
      if (!desktop) throw new Error('RELATION_DESKTOP_API_UNAVAILABLE');
      const articles = await desktop.article.readStatsSummaries();
      const summary = articles.find((article) => article.title === title);
      if (!summary) throw new Error('RELATION_ARTICLE_NOT_SAVED');
      const article = await desktop.article.get(summary.id);
      const annotation = article?.annotations[0];
      if (!annotation) throw new Error('RELATION_ANNOTATION_NOT_SAVED');
      await desktop.article.saveComment({
        articleId: article.id,
        annotationId: annotation.id,
        comment: {
          id: `relation-comment-${article.id}`,
          author: annotation.author,
          content,
          createdAt: new Date().toISOString(),
        },
      });
      return { articleId: article.id, annotationId: annotation.id, anchor: annotation.anchor };
    },
    { title: source.title, content: thought },
  );
}

export async function waitForRelationProjection(page: Page, count: number) {
  await expect
    .poll(
      async () => {
        const status = await page.evaluate(() => {
          const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
            .yomitomoDesktop;
          if (!desktop) throw new Error('RELATION_DESKTOP_API_UNAVAILABLE');
          return desktop.readingMemory.model.status();
        });
        return status.projection.coverage.projectedAssetCount;
      },
      { timeout: 15_000 },
    )
    .toBe(count);
}

async function configureRelationProvider(page: Page, baseUrl: string) {
  const providerId = await page.evaluate(async (url) => {
    const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
    if (!desktop) throw new Error('RELATION_DESKTOP_API_UNAVAILABLE');
    const store = await desktop.provider.save({
      apiKey: 'rd970-local-fixture-not-a-real-key',
      baseUrl: url,
      modelInputMode: 'custom',
      modelName: 'controlled-relations',
      name: 'Local E2E',
      type: 'openai-chat',
    });
    const provider = store.providers.find((entry) => entry.name === 'Local E2E');
    if (!provider) throw new Error('RELATION_PROVIDER_NOT_SAVED');
    try {
      await desktop.store.saveSettings({
        ...store.settings,
        defaultProviderId: provider.id,
        readingAssistantProviderId: provider.id,
      });
    } catch (error) {
      await desktop.provider.delete(provider.id);
      throw error;
    }
    return provider.id;
  }, baseUrl);
  return providerId;
}

async function currentEbookFrame(page: Page, quote: string): Promise<Frame> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames().slice(1)) {
      const matches = await frame
        .evaluate((text) => {
          const rect = window.frameElement?.getBoundingClientRect();
          return Boolean(rect?.width && rect.height && document.body?.innerText.includes(text));
        }, quote)
        .catch(() => false);
      if (matches) return frame;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('RELATION_EPUB_FRAME_UNAVAILABLE');
}
