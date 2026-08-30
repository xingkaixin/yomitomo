import type { Locator, Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import type { YomitomoDesktopApi } from '../../../src/preload';
import { openAskLibrary } from '../helpers/reading-library-fixtures';
import {
  findReadingRelations,
  importRelationSource,
  openRelationSource,
  saveRelationJudgment,
  waitForRelationProjection,
  withRelationDesktopApp,
  type RelationSource,
} from '../helpers/reading-relations-fixtures';
import {
  withReadingRelationsProvider,
  type ReadingRelationsProviderRequest,
} from '../helpers/reading-relations-provider';
import {
  openReviewQueue,
  readReviewFacts,
  revealReview,
  startReview,
} from '../helpers/reading-review-fixtures';

const sourceQuote = 'Reading memory connects saved judgments with source context';
const originalJudgment = 'Source context supports careful reading.';
const comparisonFailed =
  'A reliable comparison could not be generated. Local evidence remains available; you can retry.';

describe('reading memory release acceptance', () => {
  it('keeps all three entrances usable when the configured provider is offline', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        await withRelationDesktopApp(
          'reading-memory-offline',
          provider.baseUrl,
          async ({ page, fixtureDir, userDataDir, artifactsDir }) => {
            const first = await importAcceptanceSource(page, fixtureDir, 'RD973 offline earlier');
            const second = await importAcceptanceSource(page, fixtureDir, 'RD973 offline newer');
            await waitForRelationProjection(page, 2);
            expect((await readModelStatus(page)).model.status).toBe('not-installed');
            const before = readReviewFacts(userDataDir);

            await openRelationSource(page, second);
            const relations = await findReadingRelations(page, second);
            const relationCards = await relations
              .locator('.reading-evidence-card')
              .allTextContents();
            expect(relationCards.length).toBeGreaterThan(0);
            await relations
              .getByRole('button', { name: 'Compare with Local E2E · controlled-relations' })
              .click();
            await relations
              .getByRole('button', { name: 'Understand and compare this selection' })
              .click();
            await relations
              .getByRole('alert')
              .getByText(comparisonFailed, { exact: true })
              .waitFor();
            expect(await relations.locator('.reading-evidence-card').allTextContents()).toEqual(
              relationCards,
            );
            await relations
              .getByRole('button', { name: 'Close related reading', exact: true })
              .click();
            await page.getByRole('button', { name: 'Back to library' }).click();

            const library = await openAskLibrary(page);
            await library.getByRole('textbox', { name: 'Your question' }).fill('source context');
            await library.getByRole('button', { name: 'Ask library', exact: true }).click();
            await library
              .getByText(
                'A reliable answer could not be generated. Local evidence remains available.',
                { exact: true },
              )
              .waitFor();
            expect(await library.locator('.reading-evidence-card').count()).toBe(4);
            expect(await library.locator('.reading-library-answer').count()).toBe(0);
            expect(await library.getByRole('textbox', { name: 'Your question' }).inputValue()).toBe(
              'source context',
            );

            const review = await openReviewQueue(page);
            await startReview(review, first.title);
            const answer = 'Offline review still records my own considered judgment.';
            await revealReview(review, answer);
            const evidence = review.getByRole('region', { name: 'New evidence', exact: true });
            await evidence
              .getByRole('button', { name: 'Compare new evidence', exact: true })
              .click();
            await evidence
              .getByText(
                'The comparison could not be completed. Local candidates and review submission remain available.',
                { exact: true },
              )
              .waitFor();
            expect(await evidence.locator('.reading-evidence-card').count()).toBe(1);
            expect(readReviewFacts(userDataDir)).toEqual(before);
            await page.screenshot({
              path: `${artifactsDir}/rd973-offline-review.png`,
              fullPage: true,
            });
            await review.getByRole('button', { name: 'Still agree', exact: true }).click();
            await review.getByRole('heading', { name: 'Review saved', exact: true }).waitFor();
            const after = readReviewFacts(userDataDir);
            expect(after.comments).toEqual(before.comments);
            expect(after.reviews).toHaveLength(1);
            expect(after.reviews[0]).toMatchObject({ decision: 'still_agree', answer });
            expect(provider.requests).toHaveLength(0);
            console.info('reading-memory offline proof', {
              entrances: 3,
              acceptedRemoteRequests: 0,
              localReviewSaved: true,
            });
          },
        );
      },
      { offline: true },
    );
  }, 90_000);

  it('shows real partial semantic coverage, drops invented citations, and cancels when leaving the question page', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        await withRelationDesktopApp(
          'reading-memory-partial',
          provider.baseUrl,
          async ({ page, fixtureDir, userDataDir, artifactsDir }) => {
            const indexed = await importAcceptanceSource(page, fixtureDir, 'RD973 indexed source');
            await expect
              .poll(() => readModelStatus(page), { timeout: 20_000 })
              .toMatchObject({
                model: { status: 'available' },
                semantic: {
                  state: 'available',
                  coverage: { indexedEntryCount: 2, eligibleEntryCount: 2 },
                },
              });
            await page.evaluate(async () => {
              const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
                .yomitomoDesktop;
              if (!desktop) throw new Error('ACCEPTANCE_DESKTOP_API_UNAVAILABLE');
              await desktop.readingMemory.index.pause();
            });
            const unindexed = await importAcceptanceSource(
              page,
              fixtureDir,
              'RD973 awaiting index',
            );
            await waitForRelationProjection(page, 2);
            expect((await readModelStatus(page)).semantic).toMatchObject({
              state: 'building',
              indexingPaused: true,
              coverage: { indexedEntryCount: 2, eligibleEntryCount: 4 },
            });
            const before = readReviewFacts(userDataDir);
            const library = await openAskLibrary(page);
            await library.getByRole('textbox', { name: 'Your question' }).fill('证据观点');
            await library.getByRole('button', { name: 'Ask library', exact: true }).click();
            await library
              .getByRole('region', { name: 'Before using remote reading memory' })
              .waitFor();
            const localEvidence = library.getByRole('region', { name: 'Evidence from this scope' });
            const currentScope = library.getByRole('region', {
              name: 'Current scope and destination',
              exact: true,
            });
            await currentScope
              .getByText('Semantic index: 2 / 4 entries · Building', { exact: true })
              .waitFor();
            expect(await localEvidence.locator('.reading-evidence-card').count()).toBe(2);
            expect(await localEvidence.getByText(indexed.title, { exact: true }).count()).toBe(2);
            expect(await localEvidence.getByText(unindexed.title, { exact: true }).count()).toBe(0);
            expect(provider.requests).toHaveLength(0);
            await currentScope.scrollIntoViewIfNeeded();
            await page.screenshot({
              path: `${artifactsDir}/rd973-partial-coverage.png`,
              fullPage: true,
            });
            await library
              .getByRole('button', { name: 'Understand and answer this question' })
              .click();
            await expect.poll(() => provider.requests.length).toBe(1);
            const sent = sentEvidence(provider.requests[0]);
            const judgmentId = sent.find((item) => item.kind === 'user_judgment')?.id;
            if (!judgmentId) throw new Error('ACCEPTANCE_USER_JUDGMENT_NOT_SENT');
            const supported = 'Only this observation has a current cited judgment.';
            const invented = 'This partly invented claim must never reach the page.';
            provider.requests[0].respondWith({
              judgments: [{ text: supported, evidenceIds: [judgmentId] }],
              supporting: [{ text: invented, evidenceIds: [judgmentId, 'e-not-sent'] }],
              opposingOrLimiting: [],
              gaps: [],
            });
            await library
              .locator('.reading-library-answer-text')
              .getByText(supported, { exact: true })
              .waitFor();
            expect(await page.getByText(invented, { exact: true }).count()).toBe(0);
            expect(
              await library
                .getByRole('region', { name: 'Supporting evidence', exact: true })
                .getByRole('button', { name: 'Save as thought' })
                .count(),
            ).toBe(0);
            expect(readReviewFacts(userDataDir)).toEqual(before);
            await library.locator('.reading-library-answer').scrollIntoViewIfNeeded();
            await page.screenshot({
              path: `${artifactsDir}/rd973-partial-citations.png`,
              fullPage: true,
            });

            await library.getByRole('button', { name: 'Ask library', exact: true }).click();
            await expect.poll(() => provider.requests.length).toBe(2);
            await library
              .getByText('Answering from the selected evidence…', { exact: true })
              .waitFor();
            await page.getByRole('tab', { name: 'Distillations', exact: true }).click();
            await expect.poll(() => provider.requests[1].canceled).toBe(true);
            await page.getByRole('tab', { name: 'Ask library', exact: true }).click();
            expect(await library.getByRole('textbox', { name: 'Your question' }).inputValue()).toBe(
              '',
            );
            expect(await library.locator('.reading-library-answer').count()).toBe(0);
            expect(readReviewFacts(userDataDir)).toEqual(before);
            console.info('reading-memory partial proof', {
              indexed: 2,
              eligible: 4,
              rejectedInventedCitation: true,
              pageChangeCanceled: provider.requests[1].canceled,
            });
          },
          { env: { YOMITOMO_READING_MEMORY_FIXTURE_SCENARIO: 'available' } },
        );
      },
      { holdResponses: true },
    );
  }, 90_000);

  it('cancels comparison on app lock and requires a new review after unlocking', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        await withRelationDesktopApp(
          'reading-memory-lock',
          provider.baseUrl,
          async ({ page, fixtureDir, userDataDir, artifactsDir }) => {
            const first = await importAcceptanceSource(page, fixtureDir, 'RD973 locked earlier');
            await importAcceptanceSource(page, fixtureDir, 'RD973 locked newer');
            await waitForRelationProjection(page, 2);
            const before = readReviewFacts(userDataDir);
            const pin = '5739';
            await page.evaluate(async (value) => {
              const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
                .yomitomoDesktop;
              if (!desktop) throw new Error('ACCEPTANCE_DESKTOP_API_UNAVAILABLE');
              await desktop.appLock.setPin({ pin: value, confirmPin: value });
              await desktop.appLock.setEnabled({ enabled: true });
            }, pin);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.getByRole('button', { name: 'Add content' }).waitFor();
            try {
              let review = await openReviewQueue(page);
              await startReview(review, first.title);
              const answer = 'PRIVATE_LOCKED_REVIEW_973 must not survive this lock.';
              await revealReview(review, answer);
              const evidence = review.getByRole('region', { name: 'New evidence', exact: true });
              await evidence
                .getByRole('button', { name: 'Compare new evidence', exact: true })
                .click();
              await evidence
                .getByRole('button', { name: 'Understand and compare new evidence', exact: true })
                .click();
              await expect.poll(() => provider.requests.length).toBe(1);
              await page.getByRole('button', { name: /^Lock app \(/ }).click();
              const lock = page.getByRole('dialog', { name: 'App locked', exact: true });
              await lock.waitFor();
              await expect.poll(() => provider.requests[0].canceled).toBe(true);
              expect(await page.getByText(answer, { exact: true }).count()).toBe(0);
              await page.screenshot({
                path: `${artifactsDir}/rd973-locked-comparison.png`,
                fullPage: true,
              });
              await unlockThroughUi(page, lock, pin);
              review = await openReviewQueue(page);
              expect(await page.getByText(answer, { exact: true }).count()).toBe(0);
              await startReview(review, first.title);
              expect(
                await review
                  .getByRole('textbox', { name: 'Your current view', exact: true })
                  .inputValue(),
              ).toBe('');
              expect(readReviewFacts(userDataDir)).toEqual(before);
              expect(provider.requests).toHaveLength(1);
            } finally {
              await page.evaluate(async (value) => {
                const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
                  .yomitomoDesktop;
                if (!desktop) throw new Error('ACCEPTANCE_DESKTOP_API_UNAVAILABLE');
                const status = await desktop.appLock.getStatus();
                if (status.locked) await desktop.appLock.unlock({ pin: value });
                if (status.enabled)
                  await desktop.appLock.setEnabled({ enabled: false, pin: value });
              }, pin);
            }
            console.info('reading-memory lock proof', {
              transportCanceled: provider.requests[0].canceled,
              freshBlindAnswerRequired: true,
              savedFactsUnchanged: true,
            });
          },
        );
      },
      { holdResponses: true },
    );
  });

  it('aborts at the real remote deadline and retains local evidence without saving a result', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        await withRelationDesktopApp(
          'reading-memory-timeout',
          provider.baseUrl,
          async ({ page, fixtureDir, userDataDir, artifactsDir }) => {
            await importAcceptanceSource(page, fixtureDir, 'RD973 timeout earlier');
            const source = await importAcceptanceSource(page, fixtureDir, 'RD973 timeout newer');
            await waitForRelationProjection(page, 2);
            const before = readReviewFacts(userDataDir);
            await openRelationSource(page, source);
            const panel = await findReadingRelations(page, source);
            const localCards = await panel.locator('.reading-evidence-card').allTextContents();
            expect(localCards.length).toBeGreaterThan(0);
            await panel
              .getByRole('button', { name: 'Compare with Local E2E · controlled-relations' })
              .click();
            const startedAt = performance.now();
            await panel
              .getByRole('button', { name: 'Understand and compare this selection' })
              .click();
            await expect.poll(() => provider.requests.length).toBe(1);
            await panel
              .getByRole('alert')
              .getByText(comparisonFailed, { exact: true })
              .waitFor({ timeout: 55_000 });
            const elapsedMs = performance.now() - startedAt;
            expect(elapsedMs).toBeGreaterThanOrEqual(44_000);
            await expect.poll(() => provider.requests[0].canceled).toBe(true);
            expect(await panel.locator('.reading-evidence-card').allTextContents()).toEqual(
              localCards,
            );
            expect(readReviewFacts(userDataDir)).toEqual(before);
            expect(provider.requests).toHaveLength(1);
            await page.screenshot({
              path: `${artifactsDir}/rd973-relations-timeout.png`,
              fullPage: true,
            });
            console.info('reading-memory deadline proof', {
              elapsedMs: Math.round(elapsedMs),
              transportCanceled: provider.requests[0].canceled,
              localEvidenceRetained: localCards.length,
            });
          },
        );
      },
      { holdResponses: true },
    );
  }, 90_000);
});

async function importAcceptanceSource(page: Page, fixtureDir: string, title: string) {
  const source: RelationSource = { kind: 'web', title, quote: sourceQuote };
  await importRelationSource(page, fixtureDir, source);
  await openRelationSource(page, source);
  await saveRelationJudgment(page, source, originalJudgment);
  await page.getByRole('button', { name: 'Back to library' }).click();
  return source;
}

async function readModelStatus(page: Page) {
  return page.evaluate(async () => {
    const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
    if (!desktop) throw new Error('ACCEPTANCE_DESKTOP_API_UNAVAILABLE');
    return desktop.readingMemory.model.status();
  });
}

function sentEvidence(request: ReadingRelationsProviderRequest) {
  const input = JSON.parse(
    request.body.messages.find((message) => message.role === 'user')!.content,
  ) as {
    evidence: { id: string; kind: string }[];
  };
  return input.evidence;
}

async function unlockThroughUi(page: Page, lock: Locator, pin: string) {
  const handle = await lock
    .getByRole('button', { name: 'Slide to unlock', exact: true })
    .boundingBox();
  const track = await lock.locator('[data-slot="track"]').boundingBox();
  if (!handle || !track) throw new Error('ACCEPTANCE_UNLOCK_TRACK_UNAVAILABLE');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width - handle.width / 2, handle.y + handle.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
  await lock.getByRole('textbox', { name: 'App lock PIN', exact: true }).fill(pin);
  await lock.waitFor({ state: 'detached' });
}
