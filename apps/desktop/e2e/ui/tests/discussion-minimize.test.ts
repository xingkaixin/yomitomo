import { expect, it } from 'vitest';
import type { YomitomoDesktopApi } from '../../../src/preload';
import { createTextFixture } from '../../helpers/e2e-data';
import { withDesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
} from '../helpers/library';

it('restores a minimized discussion beyond the reader edge with its unsent reply', async () => {
  await withDesktopE2eApp('discussion-minimize', async ({ app, fixtureDir, page }) => {
    page.setDefaultTimeout(8000);
    const title = 'Discussion minimize regression';
    const quote = '收起讨论后应继续阅读，恢复时仍能接着写下尚未发送的想法。';
    const fixture = await createTextFixture(fixtureDir, {
      fileName: 'discussion-minimize.md',
      content: `${quote}\n\n${'阅读正文。\n\n'.repeat(40)}`,
    });
    await openLibraryHome(page);
    await importTextFileThroughLibraryUi(page, fixture.path, { title });
    await libraryArticleButton(page, title).click();
    await page.locator('.reader-article').getByText(quote, { exact: true }).waitFor();
    const input = await page.evaluate(
      async ({ title: articleTitle, quote: sourceQuote }) => {
        const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
          .yomitomoDesktop;
        if (!desktop) throw new Error('Desktop API unavailable');
        const article = (await desktop.article.readStatsSummaries()).find(
          (item) => item.title === articleTitle,
        );
        if (!article) throw new Error('Article was not imported');
        const now = new Date().toISOString();
        const target = { articleId: article.id, annotationId: 'annotation_minimize' };
        await desktop.article.saveAnnotation({
          articleId: article.id,
          annotation: {
            id: target.annotationId,
            anchor: {
              exact: sourceQuote,
              start: 0,
              end: sourceQuote.length,
              prefix: '',
              suffix: '',
            },
            author: { kind: 'user', username: 'reader' },
            color: '#f0d070',
            comments: [
              {
                id: 'comment_minimize',
                author: { kind: 'user', username: 'reader' },
                content: '先记下这个问题。',
                createdAt: now,
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
        });
        return target;
      },
      { title, quote },
    );

    await openLibraryHome(page);
    await libraryArticleButton(page, title).click();

    const opened = app.waitForEvent('window');
    const result = await page.evaluate(async (target) => {
      const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
      if (!desktop) throw new Error('Desktop API unavailable');
      return desktop.annotations.discussion.open(target);
    }, input);
    const discussion = await opened;
    discussion.setDefaultTimeout(8000);
    const draft = '这条回复还没有发送，恢复窗口后继续写。';
    await discussion.getByRole('textbox').fill(draft);
    const browserWindow = await app.browserWindow(discussion);
    const minimize = () =>
      app.evaluate(({ app: application, BrowserWindow }, windowId) => {
        const window = BrowserWindow.fromId(windowId);
        if (!window) throw new Error('Discussion window unavailable');
        if (process.platform !== 'darwin' && process.platform !== 'win32') {
          window.minimize();
          return;
        }
        const { createRequire } = process.getBuiltinModule('node:module');
        const { join } = process.getBuiltinModule('node:path');
        const desktopRoot = application.getAppPath();
        const native = createRequire(join(desktopRoot, 'package.json'))(
          application.isPackaged
            ? join(process.resourcesPath, 'window_controls.node')
            : join(desktopRoot, '.cache/window-controls', process.arch, 'window_controls.node'),
        ) as { requestMinimize: (handle: Buffer) => void };
        native.requestMinimize(window.getNativeWindowHandle());
      }, result.windowId);
    const readerWindow = await app.browserWindow(page);
    const windowIds = {
      readerId: await readerWindow.evaluate((window) => window.id),
      discussionId: result.windowId,
    };
    const outside = await app.evaluate(({ BrowserWindow, screen }, { readerId, discussionId }) => {
      const reader = BrowserWindow.fromId(readerId)!;
      const floatingWindow = BrowserWindow.fromId(discussionId)!;
      const work = screen.getDisplayMatching(reader.getBounds()).workArea;
      reader.setBounds({ x: work.x, y: work.y, width: 980, height: 700 });
      const bounds = reader.getContentBounds();
      reader.webContents.setZoomFactor(1.25);
      const right = bounds.x + bounds.width;
      floatingWindow.setPosition(right - floatingWindow.getBounds().width + 120, bounds.y + 20);
      const content = floatingWindow.getContentBounds();
      return { x: right + 16, y: content.y + content.height / 2, content };
    }, windowIds);
    await minimize();
    await expect
      .poll(() =>
        browserWindow.evaluate((window) => ({
          visible: window.isVisible(),
          minimized: window.isMinimized(),
        })),
      )
      .toEqual({ visible: false, minimized: false });

    await page.waitForFunction(() => !document.querySelector('[data-window-transition-target]'));
    const paintsOutsideReader = () =>
      app.evaluate(
        async ({ BrowserWindow }, { readerId, discussionId, x, y }) => {
          const floatingWindow = BrowserWindow.fromId(discussionId)!;
          if (floatingWindow.isVisible()) return false;
          const layer = BrowserWindow.fromId(readerId)
            ?.getChildWindows()
            .find((window) => window.isVisible());
          if (!layer) return false;
          const bounds = layer.getContentBounds();
          const sample = await layer.webContents.capturePage({
            x: Math.round(x - bounds.x),
            y: Math.round(y - bounds.y),
            width: 1,
            height: 1,
          });
          return !floatingWindow.isVisible() && !sample.isEmpty() && sample.toBitmap()[3] === 255;
        },
        { ...windowIds, ...outside },
      );
    await Promise.all([
      expect.poll(paintsOutsideReader, { interval: 16, timeout: 2200 }).toBe(true),
      page.getByTitle(`Open annotation discussion: ${quote}`, { exact: true }).click(),
    ]);
    await expect.poll(() => browserWindow.evaluate((window) => window.isVisible())).toBe(true);
    expect(await browserWindow.evaluate((window) => window.id)).toBe(result.windowId);
    expect(await discussion.getByRole('textbox').inputValue()).toBe(draft);

    expect(await browserWindow.evaluate((window) => window.getContentBounds())).toEqual(
      outside.content,
    );
    const inside = await readerWindow.evaluate((window) => window.getContentBounds());
    await browserWindow.evaluate(
      (window, bounds) => window.setPosition(bounds.x + 8, bounds.y + 8),
      inside,
    );
    const minimizing = minimize();
    await page.waitForFunction(() =>
      Boolean(
        document.querySelector('.annotation-discussion-window-preview')?.getAnimations().length,
      ),
    );
    await page.evaluate(async (target) => {
      const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
      if (!desktop) throw new Error('Desktop API unavailable');
      await desktop.annotations.discussion.open(target);
    }, input);
    await minimizing;
    expect(await browserWindow.evaluate((window) => window.isVisible())).toBe(true);
    expect(await discussion.getByRole('textbox').inputValue()).toBe(draft);
    await discussion.close();
  });
});
