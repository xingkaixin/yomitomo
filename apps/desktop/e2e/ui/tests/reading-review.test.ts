import { createHash } from 'node:crypto';
import type { ReadingReviewDecision } from '@yomitomo/shared';
import type { Locator } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  readLibrarySavedFacts,
  readingLibraryCollectionName,
  seedReadingLibrary,
} from '../helpers/reading-library-fixtures';
import {
  waitForRelationProjection,
  waitForRelationSource,
  withRelationDesktopApp,
} from '../helpers/reading-relations-fixtures';
import { withReadingRelationsProvider } from '../helpers/reading-relations-provider';
import {
  changeReviewComment,
  openReviewDiscussion,
  openReviewQueue,
  readReviewFacts,
  reopenReviewQueue,
  revealReview,
  seedReviewSources,
  startReview,
  withReviewWritesBlocked,
} from '../helpers/reading-review-fixtures';

const changedAnswer = 'Source context now supports my reconsidered ebook conclusion.';
const decisions = {
  web: { decision: 'still_agree', answer: 'Source context still supports my current web view.' },
  ebook: { decision: 'changed', answer: changedAnswer },
  pdf: { decision: 'need_evidence', answer: '' },
} satisfies Record<string, { decision: ReadingReviewDecision; answer: string }>;
const decisionLabels = {
  still_agree: 'Still agree',
  changed: 'My view changed',
  need_evidence: 'Need more evidence',
};

describe('reconsider reading judgments', () => {
  it('keeps the blind stage private and appends three decisions across Web, EPUB, and PDF', async () => {
    await withReadingRelationsProvider(async (provider) => {
      await withRelationDesktopApp(
        'reading-review-decisions',
        provider.baseUrl,
        async (desktop) => {
          const { page, fixtureDir, userDataDir, artifactsDir } = desktop;
          const sources = await seedReviewSources(page, fixtureDir, ['web', 'ebook', 'pdf']);
          const before = readReviewFacts(userDataDir);
          expect(before.comments).toHaveLength(3);
          expect(before.reviews).toEqual([]);
          let view = await openReviewQueue(page);
          for (const source of sources) {
            expect(
              await view.getByRole('article', { name: source.title, exact: true }).count(),
            ).toBe(1);
            for (const original of sources) {
              expect(await page.getByText(original.judgment, { exact: true }).count()).toBe(0);
            }
            await startReview(view, source.title);
            expect(provider.requests).toHaveLength(0);
            expect(await page.getByText(source.judgment, { exact: true }).count()).toBe(0);
            if (source.kind === 'web') {
              await page.screenshot({
                path: `${artifactsDir}/rd972-blind-answer.png`,
                fullPage: true,
              });
            }
            expect(
              await view
                .getByRole('button', { name: 'Reveal earlier judgment', exact: true })
                .isDisabled(),
            ).toBe(true);
            const { answer, decision } = decisions[source.kind];
            await revealReview(view, answer);
            await view
              .getByRole('region', { name: 'Earlier effective judgment', exact: true })
              .getByText(source.judgment, { exact: true })
              .waitFor();
            await assertFrozenAnswer(view, answer);
            if (!answer) {
              expect(
                await view.getByRole('button', { name: 'Still agree', exact: true }).isDisabled(),
              ).toBe(true);
              expect(
                await view
                  .getByRole('button', { name: 'My view changed', exact: true })
                  .isDisabled(),
              ).toBe(true);
            }
            expect(provider.requests).toHaveLength(0);
            if (source.kind === 'ebook') {
              await page.screenshot({ path: `${artifactsDir}/rd972-revealed.png`, fullPage: true });
            }
            await view.getByRole('button', { name: decisionLabels[decision], exact: true }).click();
            await view.getByRole('heading', { name: 'Review saved', exact: true }).waitFor();
            const after = readReviewFacts(userDataDir);
            expect(after.comments).toEqual(before.comments);
            const event = after.reviews.find((item) => item.assetId === source.commentId);
            expect(event).toMatchObject({
              articleId: source.articleId,
              annotationId: source.annotationId,
              assetType: 'comment',
              assetVersion: expect.any(String),
              judgmentSnapshot: source.judgment,
              judgmentDigest: createHash('sha256').update(source.judgment).digest('hex'),
              previousReviewId: null,
              decision,
              answer,
            });
            view = await reopenReviewQueue(page);
          }
          expect(readReviewFacts(userDataDir).reviews).toHaveLength(3);
          const ebook = sources.find((source) => source.kind === 'ebook')!;
          const historyAnswers = Array.from(
            { length: 4 },
            (_, index) =>
              `History checkpoint ${index + 1}: source context still supports my reconsidered ebook conclusion.`,
          );
          for (const answer of historyAnswers) {
            await startReview(view, ebook.title);
            await revealReview(view, answer);
            await view.getByRole('button', { name: 'Still agree', exact: true }).click();
            await view.getByRole('heading', { name: 'Review saved', exact: true }).waitFor();
            view = await reopenReviewQueue(page);
          }
          await startReview(view, ebook.title);
          expect(await page.getByText(changedAnswer, { exact: true }).count()).toBe(0);
          await revealReview(view, 'A new blind answer must not replace the saved review.');
          await view
            .getByRole('region', { name: 'Earlier effective judgment', exact: true })
            .getByText(changedAnswer, { exact: true })
            .waitFor();
          const history = view.getByRole('region', { name: 'Review history', exact: true });
          await history
            .getByRole('region', { name: 'Original judgment', exact: true })
            .getByText(ebook.judgment, { exact: true })
            .waitFor();
          await history
            .locator('.reading-review-history-event')
            .last()
            .getByText(changedAnswer, { exact: true })
            .waitFor();
          expect(await history.locator('.reading-review-history-event').count()).toBe(5);
          for (const answer of historyAnswers)
            await history.getByText(answer, { exact: true }).waitFor();
          await history
            .getByRole('heading', { name: 'Review history', exact: true })
            .scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${artifactsDir}/rd972-long-history.png`, fullPage: true });
          const scroller = view.locator('.reading-review');
          const scrollHeight = await scroller.evaluate((element) => element.scrollHeight);
          const scrollBox = await scroller.boundingBox();
          if (!scrollBox) throw new Error('REVIEW_SCROLL_SURFACE_UNAVAILABLE');
          expect(scrollHeight).toBeGreaterThan(scrollBox.height);
          await page.mouse.move(
            scrollBox.x + scrollBox.width / 2,
            scrollBox.y + scrollBox.height / 2,
          );
          await page.mouse.wheel(0, scrollHeight);
          const oldestReview = history.locator('.reading-review-history-event').last();
          await expect
            .poll(async () => {
              const box = await oldestReview.boundingBox();
              return (
                box !== null &&
                box.y >= scrollBox.y &&
                box.y + box.height <= scrollBox.y + scrollBox.height
              );
            })
            .toBe(true);
          await page.screenshot({
            path: `${artifactsDir}/rd972-long-history-bottom.png`,
            fullPage: true,
          });
          await view.getByRole('button', { name: 'Cancel review', exact: true }).click();
          await waitForRelationProjection(page, 3);
          await page.getByRole('tab', { name: 'Ask library', exact: true }).click();
          const library = page.getByRole('tabpanel', { name: 'Ask library', exact: true });
          await library.getByRole('textbox', { name: 'Your question' }).fill('reconsidered ebook');
          await library.getByRole('button', { name: 'Ask library', exact: true }).click();
          const foldedEvidence = library
            .locator('.reading-evidence-card')
            .filter({ hasText: changedAnswer });
          await foldedEvidence.waitFor();
          expect(await library.getByText(ebook.judgment, { exact: true }).count()).toBe(0);
          await foldedEvidence.getByRole('button', { name: 'Back to source', exact: true }).click();
          await waitForRelationSource(page, ebook);
          await page
            .locator('.reader-note-quote-text')
            .getByText(ebook.quote, { exact: true })
            .waitFor();
          expect(readReviewFacts(userDataDir).comments).toEqual(before.comments);
          expect(readReviewFacts(userDataDir).reviews).toHaveLength(7);
          expect(provider.requests).toHaveLength(0);
          console.info('reading-review decision proof', {
            formats: sources.map((source) => source.kind),
            decisions: readReviewFacts(userDataDir).reviews.map((event) => event.decision),
            originalCommentsUnchanged: true,
            foldedEbookEvidenceReturnedToSource: true,
            remoteRequests: provider.requests.length,
          });
        },
      );
    });
  }, 90_000);

  it('retries a real SQLite failure, requires a fresh blind answer after conflict, and removes a deleted asset', async () => {
    await withReadingRelationsProvider(async (provider) => {
      await withRelationDesktopApp('reading-review-recovery', provider.baseUrl, async (desktop) => {
        const { page, fixtureDir, userDataDir, artifactsDir } = desktop;
        const [source] = await seedReviewSources(page, fixtureDir, ['web']);
        const before = readReviewFacts(userDataDir);
        let view = await openReviewQueue(page);
        await startReview(view, source.title);
        const answer = 'This blind answer must survive a recoverable SQLite failure.';
        await revealReview(view, answer);
        await withReviewWritesBlocked(userDataDir, async () => {
          await view.getByRole('button', { name: 'Still agree', exact: true }).click();
          await view.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
          await assertFrozenAnswer(view, answer);
          expect(readReviewFacts(userDataDir)).toEqual(before);
          await view.getByRole('button', { name: 'Retry save', exact: true }).click();
          await view.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
          await assertFrozenAnswer(view, answer);
          expect(readReviewFacts(userDataDir)).toEqual(before);
          await page.screenshot({ path: `${artifactsDir}/rd972-submit-retry.png`, fullPage: true });
        });
        await view.getByRole('button', { name: 'Retry save', exact: true }).click();
        await view.getByRole('heading', { name: 'Review saved', exact: true }).waitFor();
        const saved = readReviewFacts(userDataDir);
        expect(saved.comments).toEqual(before.comments);
        expect(saved.reviews).toHaveLength(1);
        expect(saved.reviews[0]).toMatchObject({ decision: 'still_agree', answer });

        view = await reopenReviewQueue(page);
        await startReview(view, source.title);
        await revealReview(view, 'This answer belongs to an obsolete source version.');
        const editedJudgment = 'Source context changed while this review was open elsewhere.';
        await changeReviewComment(page, source, editedJudgment);
        await view.getByRole('button', { name: 'My view changed', exact: true }).click();
        await view.getByRole('alert').waitFor();
        await view.getByRole('button', { name: 'Start again', exact: true }).waitFor();
        expect(await view.getByRole('button', { name: 'Retry save', exact: true }).count()).toBe(0);
        expect(readReviewFacts(userDataDir).reviews).toEqual(saved.reviews);
        await page.screenshot({
          path: `${artifactsDir}/rd972-version-conflict.png`,
          fullPage: true,
        });
        await view.getByRole('button', { name: 'Start again', exact: true }).click();
        await view.getByRole('textbox', { name: 'Your current view', exact: true }).waitFor();
        expect(
          await view.getByRole('textbox', { name: 'Your current view', exact: true }).inputValue(),
        ).toBe('');
        expect(await page.getByText(editedJudgment, { exact: true }).count()).toBe(0);
        await revealReview(view, 'A fresh answer written after restarting the review.');
        await view
          .getByRole('region', { name: 'Earlier effective judgment', exact: true })
          .getByText(editedJudgment, { exact: true })
          .waitFor();
        await view.getByRole('button', { name: 'Cancel review', exact: true }).click();
        await view.getByRole('article', { name: source.title, exact: true }).waitFor();
        const discussion = await openReviewDiscussion(desktop, source);
        try {
          const thought = discussion
            .locator('.annotation-discussion-idea')
            .filter({ hasText: editedJudgment });
          await thought.getByRole('button', { name: 'More thought actions', exact: true }).click();
          await discussion
            .getByRole('menuitem', { name: 'Delete this thought and its replies', exact: true })
            .click();
          await discussion
            .getByRole('dialog', { name: 'Delete this thought?', exact: true })
            .getByRole('button', { name: 'Delete thought', exact: true })
            .click();
          await thought.waitFor({ state: 'detached' });
          await expect
            .poll(async () =>
              view.getByRole('article', { name: source.title, exact: true }).count(),
            )
            .toBe(0);
          expect(readReviewFacts(userDataDir).comments).toEqual([]);
        } finally {
          await discussion.close();
        }
        expect(provider.requests).toHaveLength(0);
        console.info('reading-review recovery proof', {
          failedWrites: 2,
          savedBeforeDelete: saved.reviews.length,
          versionConflictRequiredRestart: true,
          deletedAssetRemovedWithoutReload: true,
          remoteRequests: provider.requests.length,
        });
      });
    });
  });

  it('only compares explicitly, bounds the remote payload, and retains local evidence after cancellation and failure', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        await withRelationDesktopApp(
          'reading-review-comparison',
          provider.baseUrl,
          async (desktop) => {
            const { page, fixtureDir, userDataDir, artifactsDir } = desktop;
            const { sources } = await seedReadingLibrary(page, fixtureDir);
            await changeReviewComment(
              page,
              { ...sources[0], commentId: `relation-comment-${sources[0].articleId}` },
              'Original evidence matters; similarity alone cannot prove agreement.',
            );
            await waitForRelationProjection(page, 3);
            const libraryFacts = await readLibrarySavedFacts(
              page,
              sources.map((source) => source.articleId),
            );
            expect(readReviewFacts(userDataDir).comments).toHaveLength(15);
            let view = await openReviewQueue(page);
            for (const comment of libraryFacts.flatMap((source) => source.comments)) {
              expect(await page.getByText(comment.content, { exact: true }).count()).toBe(0);
            }
            expect(provider.requests).toHaveLength(0);
            const historyAnswer = 'PRIVATE_REVIEW_HISTORY_972: earlier reasoning stays on device.';
            await startReview(view, sources.find((source) => source.kind === 'ebook')!.title);
            await revealReview(view, historyAnswer);
            await view.getByRole('button', { name: 'Still agree', exact: true }).click();
            await view.getByRole('heading', { name: 'Review saved', exact: true }).waitFor();
            await waitForRelationProjection(page, 3);
            const before = readReviewFacts(userDataDir);
            expect(before.reviews).toHaveLength(1);
            view = await reopenReviewQueue(page);
            await startReview(view, sources[0].title);
            const blindAnswer = 'PRIVATE_BLIND_ANSWER_972: evidence cannot silently decide for me.';
            await revealReview(view, blindAnswer);
            const previousJudgment = await view
              .getByRole('region', { name: 'Earlier effective judgment', exact: true })
              .locator('blockquote')
              .innerText();
            const evidence = view.getByRole('region', { name: 'New evidence', exact: true });
            expect(provider.requests).toHaveLength(0);
            await evidence
              .getByRole('button', { name: 'Compare new evidence', exact: true })
              .click();
            await evidence
              .getByRole('region', { name: 'Before using remote reading memory', exact: true })
              .waitFor();
            const cards = evidence.locator('.reading-evidence-card');
            const localCards = await cards.allTextContents();
            expect(localCards).toHaveLength(6);
            expect(provider.requests).toHaveLength(0);
            await evidence
              .getByRole('button', { name: 'Understand and compare new evidence', exact: true })
              .click();
            await expect.poll(() => provider.requests.length).toBe(1);
            const body = provider.requests[0].body;
            const input = JSON.parse(
              body.messages.find((message) => message.role === 'user')!.content,
            ) as {
              kind: string;
              input: { judgment: string };
              evidence: { id: string; kind: string; text: string; excerpt?: string }[];
            };
            expect(body.model).toBe('controlled-relations');
            expect(body).not.toHaveProperty('tools');
            expect(Object.keys(input).toSorted()).toEqual(['evidence', 'input', 'kind']);
            expect(input.kind).toBe('evidence-comparison');
            expect(input.input).toEqual({ judgment: previousJudgment });
            expect(input.evidence.length).toBeGreaterThan(0);
            expect(input.evidence.length).toBeLessThanOrEqual(6);
            expect(Buffer.byteLength(JSON.stringify(input), 'utf8')).toBeLessThanOrEqual(4000);
            for (const item of input.evidence) {
              expect(item.id).toMatch(/^e\d+$/);
              expect(
                Object.keys(item).filter((key) => !['id', 'kind', 'text', 'excerpt'].includes(key)),
              ).toEqual([]);
            }
            const serialized = JSON.stringify(body);
            for (const privateValue of [
              blindAnswer,
              historyAnswer,
              readingLibraryCollectionName,
              ...before.reviews.flatMap((event) => [
                event.id,
                event.assetVersion,
                event.judgmentDigest,
              ]),
              ...sources.flatMap((source) => [source.title, source.articleId, source.annotationId]),
              ...libraryFacts.flatMap((source) => source.comments.map((comment) => comment.id)),
            ]) {
              expect(serialized).not.toContain(privateValue);
            }
            await evidence.getByRole('button', { name: 'Cancel', exact: true }).click();
            await expect.poll(() => provider.requests[0].canceled).toBe(true);
            await evidence
              .getByText(
                'Comparison canceled. Local candidates and review submission remain available.',
                { exact: true },
              )
              .waitFor();
            await evidence
              .getByRole('button', { name: 'Compare new evidence', exact: true })
              .waitFor();
            expect(await cards.allTextContents()).toEqual(localCards);
            await assertFrozenAnswer(view, blindAnswer);
            expect(
              await view.getByRole('button', { name: 'Still agree', exact: true }).isEnabled(),
            ).toBe(true);
            expect(readReviewFacts(userDataDir)).toEqual(before);

            await evidence
              .getByRole('button', { name: 'Compare new evidence', exact: true })
              .click();
            await expect.poll(() => provider.requests.length).toBe(2);
            provider.requests[1].fail();
            await evidence
              .getByText(
                'The comparison could not be completed. Local candidates and review submission remain available.',
                { exact: true },
              )
              .waitFor();
            await evidence
              .getByRole('button', { name: 'Compare new evidence', exact: true })
              .waitFor();
            expect(await cards.allTextContents()).toEqual(localCards);
            expect(readReviewFacts(userDataDir)).toEqual(before);
            await assertFrozenAnswer(view, blindAnswer);
            expect(
              await view.getByRole('button', { name: 'Still agree', exact: true }).isEnabled(),
            ).toBe(true);
            await page.screenshot({
              path: `${artifactsDir}/rd972-comparison-local-fallback.png`,
              fullPage: true,
            });

            await evidence
              .getByRole('button', { name: 'Compare new evidence', exact: true })
              .click();
            await expect.poll(() => provider.requests.length).toBe(3);
            provider.requests[2].respond('Controlled new evidence comparison.');
            await evidence
              .getByText('Controlled new evidence comparison.', { exact: true })
              .waitFor();
            await evidence
              .getByRole('region', { name: 'Send receipt', exact: true })
              .getByText(`${input.evidence.length} evidence items sent`, { exact: true })
              .waitFor();
            await assertFrozenAnswer(view, blindAnswer);
            expect(readReviewFacts(userDataDir)).toEqual(before);
            await page.screenshot({
              path: `${artifactsDir}/rd972-explicit-comparison.png`,
              fullPage: true,
            });
            console.info('reading-review remote proof', {
              localBeforeExplicitComparison: true,
              localEvidence: localCards.length,
              sentEvidence: input.evidence.length,
              sentBytes: Buffer.byteLength(JSON.stringify(input), 'utf8'),
              transportCanceled: provider.requests[0].canceled,
              failedComparisonKeptLocalEvidence: true,
              originalFactsUnchanged: true,
              remoteRequests: provider.requests.length,
            });
          },
        );
      },
      { holdResponses: true },
    );
  }, 90_000);
});

async function assertFrozenAnswer(view: Locator, answer: string) {
  const frozen = view.getByRole('region', { name: 'Your frozen answer', exact: true });
  await frozen.waitFor();
  if (answer) await frozen.getByText(answer, { exact: true }).waitFor();
  expect(
    await view
      .locator('textarea:not([readonly]), input:not([readonly]), [contenteditable="true"]')
      .count(),
  ).toBe(0);
}
