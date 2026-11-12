import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { YomitomoDesktopApi } from '../../../src/preload';
import { createTextFixture } from '../../helpers/e2e-data';
import { withDesktopE2eApp } from '../helpers/electron-app';
import { importTextFileThroughLibraryUi, openLibraryHome } from '../helpers/library';

it('reaches every review change when inserted text is longer than the original draft', async () => {
  await withDesktopE2eApp(
    'distillation-review-scroll',
    async ({ app, artifactsDir, fixtureDir, page }) => {
      const title = '沉淀审阅回归';
      const quote = '原文中的主张需要区分证据与推断。';
      const fixture = await createTextFixture(fixtureDir, {
        content: `${quote}\n\n${'后续原文用于验证引用能滚动回对应段落。\n\n'.repeat(50)}`,
        fileName: 'review.md',
      });
      await openLibraryHome(page);
      await importTextFileThroughLibraryUi(page, fixture.path, { title });
      const saved = await page.evaluate(
        async (input) => {
          const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
            .yomitomoDesktop;
          if (!desktop) throw new Error('Desktop API unavailable');
          const summary = (await desktop.article.readStatsSummaries()).find(
            (article) => article.title === input.title,
          );
          if (!summary) throw new Error('Review article was not imported');
          const now = new Date().toISOString();
          const draft = '# 区分证据与推断\n\n原来的判断。\n\n保留这段补充。';
          const added =
            Array.from(
              { length: 18 },
              (_, index) => `补充证据 ${index + 1}：这段话说明证据的来源，不能把缺乏证据当作反证。`,
            ).join('\n\n') + `\n\n参见[原文中的主张](#passage:0-${input.quote.length})。`;
          const store = await desktop.store.getState();
          const agent = store.agents.find((entry) => entry.kind === 'review');
          const agentId = agent?.id || 'agent_reviewer';
          await desktop.article.saveAnnotation({
            articleId: summary.id,
            annotation: {
              id: 'annotation_review',
              author: { kind: 'user', username: 'reader' },
              anchor: {
                exact: input.quote,
                start: 0,
                end: input.quote.length,
                prefix: '',
                suffix: '',
              },
              color: '#f0d070',
              comments: [],
              createdAt: now,
              updatedAt: now,
              distillation: {
                status: 'published',
                content: draft,
                updatedAt: now,
                publishedAt: now,
                reviewSessions: [
                  {
                    id: 'review_session',
                    agentId,
                    createdAt: now,
                    updatedAt: now,
                    messages: [
                      {
                        id: 'review_message',
                        author: {
                          kind: 'agent',
                          agentId,
                          username: 'reviewer',
                          nickname: '审阅助手',
                        },
                        content: '把证据来源补进草稿，并检查结论是否过强。',
                        createdAt: now,
                        status: 'done',
                        proposals: [
                          {
                            id: 'proposal_insert',
                            kind: 'insert',
                            status: 'pending',
                            title: '补充证据来源',
                            rationale: '区分可核实的证据与推断。',
                            insertAfterText: '原来的判断。',
                            content: added,
                            updatedAt: now,
                          },
                          {
                            id: 'proposal_replace',
                            kind: 'replace',
                            status: 'pending',
                            title: '调整最后的判断',
                            rationale: '请检查是否需要替换这段补充。',
                            targetText: '保留这段补充。',
                            replacementText: '这是一段替换后的判断。',
                            updatedAt: now,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          });
          return { articleId: summary.id, annotationId: 'annotation_review', added };
        },
        { title, quote },
      );
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: '简体中文', exact: true }).click();
      await page.waitForFunction(
        () => window.localStorage.getItem('yomitomo.uiLanguage') === 'zh-CN',
      );

      const opened = app.waitForEvent('window');
      await page.evaluate(
        async (input) => {
          const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
            .yomitomoDesktop;
          if (!desktop) throw new Error('Desktop API unavailable');
          await desktop.annotations.sedimentation.open(input);
        },
        { articleId: saved.articleId, annotationId: saved.annotationId },
      );
      const review = await opened;
      review.setDefaultTimeout(8000);
      try {
        const browserWindow = await app.browserWindow(review);
        await browserWindow.evaluate((window) => window.setContentSize(760, 560));
        await review.getByRole('button', { name: '预览变更', exact: true }).first().click();
        await review.getByRole('status').filter({ hasText: '待处理 2 处' }).waitFor();
        const preview = review.locator('.annotation-sedimentation-draft-preview-text');
        await preview.hover();
        await review.mouse.wheel(0, -10000);
        await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBe(0);
        await review.mouse.wheel(0, 500);
        await expect
          .poll(() => preview.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
        await review.getByRole('button', { name: '下一处变更', exact: true }).click();
        const second = review.locator('[data-proposal-id="proposal_replace"]');
        await expect
          .poll(async () => {
            const button = await second
              .getByRole('button', { name: '保留', exact: true })
              .boundingBox();
            const viewport = await preview.boundingBox();
            return Boolean(
              button &&
              viewport &&
              button.y >= viewport.y &&
              button.y + button.height <= viewport.y + viewport.height,
            );
          })
          .toBe(true);
        await review.screenshot({
          path: join(artifactsDir, 'distillation-review-small-window.png'),
        });
        await page.getByRole('radio', { name: '暗色', exact: true }).click();
        await review.waitForFunction(() => document.documentElement.dataset.themeTone === 'dark');
        await browserWindow.evaluate((window) => window.setContentSize(1100, 720));
        await review.getByRole('button', { name: '定位变更', exact: true }).last().click();
        await review.screenshot({ path: join(artifactsDir, 'distillation-review-dark.png') });
        await page.getByRole('radio', { name: '亮色', exact: true }).click();
        await review.waitForFunction(() => document.documentElement.dataset.themeTone === 'light');
        await browserWindow.evaluate((window) => window.setContentSize(760, 560));
        await page.getByRole('button', { name: '阅读库', exact: true }).click();
        await page.getByRole('button', { name: `打开文章：${title}`, exact: true }).click();
        await page.locator('.reader-article').getByText(quote, { exact: true }).waitFor();
        await review.getByRole('button', { name: '上一处变更', exact: true }).click();
        await review
          .locator('[data-proposal-id="proposal_insert"]')
          .getByRole('button', { name: '保留', exact: true })
          .click();
        await review.getByRole('status').filter({ hasText: '待处理 1 处' }).waitFor();
        await second.getByRole('button', { name: '放弃', exact: true }).click();
        const draftDocument = review.locator('.annotation-sedimentation-draft-document');
        await draftDocument.waitFor();
        expect(await draftDocument.textContent()).toContain('保留这段补充。');
        expect(await draftDocument.textContent()).not.toContain('这是一段替换后的判断。');
        await review.getByRole('button', { name: '恢复', exact: true }).waitFor();
        await review.reload({ waitUntil: 'domcontentloaded' });
        await draftDocument.waitFor();
        const readerSurface = page.locator('.reader-surface');
        await readerSurface.hover();
        await page.mouse.wheel(0, 3000);
        await expect
          .poll(() => readerSurface.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(200);
        await draftDocument.getByRole('link', { name: '原文中的主张' }).click();
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
        await review.getByRole('button', { name: '编辑草稿', exact: true }).click();
        const text = await review
          .locator('.annotation-sedimentation-document textarea')
          .inputValue();
        expect(text).toContain(saved.added);
        await review.getByRole('button', { name: '完成编辑', exact: true }).click();
        const closed = review.waitForEvent('close');
        await review.getByRole('button', { name: '更新发布', exact: true }).click();
        await closed;
        const distillation = await page.evaluate(async ({ articleId, annotationId }) => {
          const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
            .yomitomoDesktop;
          if (!desktop) throw new Error('Desktop API unavailable');
          const article = await desktop.article.get(articleId);
          return article?.annotations.find((annotation) => annotation.id === annotationId)
            ?.distillation;
        }, saved);
        expect(distillation?.content).toBe(text.trim());
        expect(
          distillation?.reviewSessions?.[0]?.messages[0]?.proposals?.map(
            (proposal) => proposal.status,
          ),
        ).toEqual(['accepted', 'ignored']);
      } catch (error) {
        await review
          .screenshot({ path: join(artifactsDir, 'distillation-review-failure.png') })
          .catch(() => undefined);
        throw error;
      } finally {
        if (!review.isClosed()) await review.close();
      }
    },
  );
});
