import { join } from 'node:path';
import SQLiteDatabase from 'better-sqlite3';
import { expect, it } from 'vitest';
import type { YomitomoDesktopApi } from '../../../src/preload';
import { createTextFixture } from '../../helpers/e2e-data';
import { withDesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
} from '../helpers/library';

it('shows readable source links in saved assistant replies without rewriting the conversation', async () => {
  await withDesktopE2eApp(
    'discussion-references',
    async ({ app, artifactsDir, fixtureDir, page, userDataDir }) => {
      const title = 'Discussion reference regression';
      const quote = '判断之前应先核对原文证据。';
      const fixture = await createTextFixture(fixtureDir, {
        fileName: 'discussion-references.md',
        content: `${quote}\n\n${'后面的段落用于验证引用链接能定位回原文。\n\n'.repeat(50)}`,
      });
      await openLibraryHome(page);
      await importTextFileThroughLibraryUi(page, fixture.path, { title });
      await libraryArticleButton(page, title).click();
      await page.locator('.reader-article').getByText(quote, { exact: true }).waitFor();
      const saved = await page.evaluate(
        async (input) => {
          const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
            .yomitomoDesktop;
          if (!desktop) throw new Error('Desktop API unavailable');
          const article = (await desktop.article.readStatsSummaries()).find(
            (entry) => entry.title === input.title,
          );
          if (!article) throw new Error('Article was not imported');
          const text = document.querySelector('.reader-article')?.textContent || '';
          const start = text.indexOf(input.quote);
          if (start < 0) throw new Error('Source quote was not rendered');
          const end = start + input.quote.length;
          await desktop.assistant.saveArticleText({
            articleId: article.id,
            snapshot: { text, sections: [] },
          });
          const now = new Date().toISOString();
          const assistantContent = `展开在[第 b51 段](#passage:${start}-${end})，请先核对原文。`;
          const userContent = '我把“第 b51 段”记在自己的笔记中。';
          await desktop.article.saveAnnotation({
            articleId: article.id,
            annotation: {
              id: 'annotation_references',
              author: { kind: 'user', username: 'reader' },
              anchor: { exact: input.quote, start, end, prefix: '', suffix: '' },
              color: '#f0d070',
              createdAt: now,
              updatedAt: now,
              comments: [
                {
                  id: 'comment_root',
                  author: { kind: 'user', username: 'reader' },
                  content: '请核对这个判断。',
                  createdAt: now,
                },
                {
                  id: 'comment_assistant',
                  replyTo: 'comment_root',
                  author: {
                    kind: 'agent',
                    agentId: 'agent_reference',
                    username: 'reference',
                    nickname: '阅读助手',
                  },
                  content: assistantContent,
                  createdAt: now,
                },
                {
                  id: 'comment_user',
                  replyTo: 'comment_root',
                  author: { kind: 'user', username: 'reader' },
                  content: userContent,
                  createdAt: now,
                },
              ],
            },
          });
          return {
            articleId: article.id,
            annotationId: 'annotation_references',
            assistantContent,
            userContent,
            href: `#passage:${start}-${end}`,
          };
        },
        { title, quote },
      );

      const opened = app.waitForEvent('window');
      await page.evaluate(async ({ articleId, annotationId }) => {
        const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
          .yomitomoDesktop;
        if (!desktop) throw new Error('Desktop API unavailable');
        await desktop.annotations.discussion.open({ articleId, annotationId });
      }, saved);
      const discussion = await opened;
      discussion.setDefaultTimeout(8000);
      try {
        const assistant = discussion.locator('.annotation-discussion-bubble-row.is-assistant');
        const link = assistant.getByRole('link', { name: `「${quote}」`, exact: true });
        await link.waitFor();
        expect(await link.getAttribute('href')).toBe(saved.href);
        expect(await assistant.textContent()).not.toContain('b51');
        await discussion.getByText(saved.userContent, { exact: true }).waitFor();
        await discussion.reload({ waitUntil: 'domcontentloaded' });
        await link.waitFor();
        await discussion.screenshot({
          animations: 'disabled',
          path: join(artifactsDir, 'discussion-references.png'),
        });

        const readerSurface = page.locator('.reader-surface');
        await readerSurface.hover();
        await page.mouse.wheel(0, 3000);
        await expect
          .poll(() => readerSurface.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(200);
        await link.click();
        await expect
          .poll(async () => {
            const target = await page
              .locator('.reader-article')
              .getByText(quote, { exact: true })
              .boundingBox();
            const viewport = await readerSurface.boundingBox();
            return Boolean(
              target &&
              viewport &&
              target.y >= viewport.y &&
              target.y + target.height <= viewport.y + viewport.height,
            );
          })
          .toBe(true);

        const database = new SQLiteDatabase(join(userDataDir, 'yomitomo.sqlite'), {
          readonly: true,
          fileMustExist: true,
        });
        try {
          const read = database.prepare('SELECT content FROM comments WHERE id = ?');
          expect(read.get('comment_assistant')).toEqual({ content: saved.assistantContent });
          expect(read.get('comment_user')).toEqual({ content: saved.userContent });
        } finally {
          database.close();
        }
      } catch (error) {
        await discussion
          .screenshot({ path: join(artifactsDir, 'discussion-references-failure.png') })
          .catch(() => undefined);
        throw error;
      } finally {
        if (!discussion.isClosed()) await discussion.close();
      }
    },
  );
});
