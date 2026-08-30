import type { ReadingEvidenceScope } from '@yomitomo/shared';
import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import type { YomitomoDesktopApi } from '../../../src/preload';
import {
  openAskLibrary,
  readLibrarySavedFacts,
  readingLibraryCollectionName,
  readingLibraryQuestion,
  seedReadingLibrary,
} from '../helpers/reading-library-fixtures';
import { withRelationDesktopApp } from '../helpers/reading-relations-fixtures';
import {
  controlledLibraryClaims,
  withReadingRelationsProvider,
} from '../helpers/reading-relations-provider';

type SentLibraryInput = {
  kind: string;
  input: { question: string };
  evidence: { id: string; kind: string; text: string; excerpt?: string }[];
};

describe('ask reading library', () => {
  it('sends bounded evidence only after consent and opens an unsaved, citation-bound thought draft', async () => {
    await withReadingRelationsProvider(async (provider) => {
      await withRelationDesktopApp(
        'reading-library-answer',
        provider.baseUrl,
        async ({ app, page, fixtureDir, artifactsDir }) => {
          const { sources } = await seedReadingLibrary(page, fixtureDir);
          const articleIds = sources.map((source) => source.articleId);
          const before = await readLibrarySavedFacts(page, articleIds);
          expect(before.flatMap((article) => article.comments)).toHaveLength(15);
          const view = await openAskLibrary(page);
          const context = view.getByRole('region', { name: 'Current scope and destination' });
          await context.getByText('3 sources · 15 saved judgments', { exact: true }).waitFor();
          await context
            .getByText('Provider: Local E2E · Model: controlled-relations', { exact: true })
            .waitFor();
          expect(provider.requests).toHaveLength(0);
          await page.screenshot({
            path: `${artifactsDir}/rd971-library-context.png`,
            fullPage: true,
          });

          await view.getByRole('textbox', { name: 'Your question' }).fill(readingLibraryQuestion);
          await view.getByRole('button', { name: 'Ask library', exact: true }).click();
          await view
            .getByRole('region', { name: 'Evidence from this scope' })
            .getByText(/^12 local evidence items ·/)
            .waitFor();
          await view.getByRole('region', { name: 'Before using remote reading memory' }).waitFor();
          expect(provider.requests).toHaveLength(0);
          await view
            .getByRole('button', { name: 'Understand and answer this question', exact: true })
            .click();
          for (const text of Object.values(controlledLibraryClaims)) {
            await view
              .locator('.reading-library-answer-text')
              .getByText(text, { exact: true })
              .waitFor();
          }
          await view
            .getByRole('region', { name: 'What was sent' })
            .getByText('12 evidence items sent', { exact: true })
            .waitFor();
          expect(provider.requests).toHaveLength(1);
          const request = provider.requests[0].body;
          expect(request.model).toBe('controlled-relations');
          expect(request).not.toHaveProperty('tools');
          const input = JSON.parse(
            request.messages.find((message) => message.role === 'user')!.content,
          ) as SentLibraryInput;
          expect(Object.keys(input).toSorted()).toEqual(['evidence', 'input', 'kind']);
          expect(input.kind).toBe('library-answer');
          expect(input.input).toEqual({ question: readingLibraryQuestion });
          expect(input.evidence).toHaveLength(12);
          for (const evidence of input.evidence) {
            expect(evidence.id).toMatch(/^e\d+$/);
            expect(
              Object.keys(evidence).filter(
                (key) => !['id', 'kind', 'text', 'excerpt'].includes(key),
              ),
            ).toEqual([]);
          }
          const serialized = JSON.stringify(request);
          const privateValues = [
            readingLibraryCollectionName,
            ...sources.flatMap((source) => [source.title, source.articleId, source.annotationId]),
            ...before.flatMap((article) => article.comments.map((comment) => comment.id)),
          ];
          for (const value of privateValues) expect(serialized).not.toContain(value);
          expect(await readLibrarySavedFacts(page, articleIds)).toEqual(before);
          await page.screenshot({
            path: `${artifactsDir}/rd971-library-answer.png`,
            fullPage: true,
          });
          const scroller = view.locator('.reading-library-question');
          const geometry = await scroller.evaluate((element) => ({
            height: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }));
          expect(geometry.scrollHeight).toBeGreaterThan(geometry.height);
          const scrollBox = await scroller.boundingBox();
          if (!scrollBox) throw new Error('LIBRARY_SCROLL_SURFACE_UNAVAILABLE');
          await page.mouse.move(
            scrollBox.x + scrollBox.width / 2,
            scrollBox.y + scrollBox.height / 2,
          );
          await page.mouse.wheel(0, geometry.scrollHeight);
          const lastSourceButton = view
            .getByRole('region', { name: 'Evidence from this scope' })
            .locator('.reading-evidence-card')
            .last()
            .getByRole('button', { name: 'Back to source' });
          await expect
            .poll(async () => {
              const button = await lastSourceButton.boundingBox();
              return (
                button !== null &&
                button.y >= scrollBox.y &&
                button.y + button.height <= scrollBox.y + scrollBox.height
              );
            })
            .toBe(true);
          await page.screenshot({
            path: `${artifactsDir}/rd971-library-long-results.png`,
            fullPage: true,
          });
          console.info('reading-library remote proof', {
            sources: 3,
            savedJudgments: 15,
            localBeforeConsent: true,
            sentEvidence: input.evidence.length,
            remoteRequests: provider.requests.length,
            scrollHeight: geometry.scrollHeight,
            viewportHeight: geometry.height,
            lastSourceReachableByWheel: true,
          });

          await view
            .getByRole('region', { name: 'Earlier judgments', exact: true })
            .getByRole('button', { name: 'Save as thought', exact: true })
            .click();
          const chooser = page.getByRole('dialog', { name: 'Save as thought', exact: true });
          await chooser.waitFor();
          expect(await chooser.getByRole('radio').count()).toBe(2);
          expect(await chooser.getByRole('radio', { checked: true }).count()).toBe(0);
          expect(await chooser.getByRole('button', { name: 'Open draft' }).isDisabled()).toBe(true);
          const citationTitles = await chooser
            .locator('.reading-library-thought-citation strong')
            .allTextContents();
          expect(new Set(citationTitles).size).toBe(2);
          const chosenSource = sources.find((source) => source.title === citationTitles[1])!;
          await chooser.getByRole('radio').nth(1).check();
          const discussionPromise = app.waitForEvent('window');
          await chooser.getByRole('button', { name: 'Open draft' }).click();
          const discussion = await discussionPromise;
          try {
            const draft = discussion.getByRole('textbox', { name: 'Thought content', exact: true });
            await draft.waitFor();
            expect(await draft.inputValue()).toBe(controlledLibraryClaims.judgments);
            expect(await view.getByRole('textbox', { name: 'Your question' }).inputValue()).toBe(
              readingLibraryQuestion,
            );
            expect(await view.locator('.reading-library-answer').isVisible()).toBe(true);
            const edited = `${controlledLibraryClaims.judgments} I confirmed this draft before saving.`;
            await draft.fill(edited);
            expect(await readLibrarySavedFacts(page, articleIds)).toEqual(before);
            expect(await view.locator('.reading-library-answer').isVisible()).toBe(true);
            await discussion
              .locator('.annotation-discussion-add-modal')
              .getByRole('button', { name: 'Add', exact: true })
              .click();
            await expect
              .poll(async () => {
                const saved = await readLibrarySavedFacts(page, articleIds);
                return saved
                  .flatMap((article) => article.comments)
                  .filter((comment) => comment.content === edited).length;
              })
              .toBe(1);
            const after = await readLibrarySavedFacts(page, articleIds);
            expect(after.flatMap((article) => article.comments)).toHaveLength(16);
            expect(
              after.find((article) => article.articleId === chosenSource.articleId)?.comments,
            ).toContainEqual({
              id: expect.any(String),
              annotationId: chosenSource.annotationId,
              content: edited,
            });
            expect(after.map((article) => article.readerChatState)).toEqual(
              before.map((article) => article.readerChatState),
            );
            expect(await view.getByRole('textbox', { name: 'Your question' }).inputValue()).toBe(
              readingLibraryQuestion,
            );
            expect(provider.requests).toHaveLength(1);
            console.info('reading-library draft proof', {
              citationSelected: true,
              unchangedBeforeExplicitSave: true,
              savedJudgments: 16,
              mainQuestionPreserved: true,
            });
          } finally {
            await discussion.close();
          }
        },
      );
    });
  });

  it('restricts collection and selected-source evidence and retains local results after cancellation', async () => {
    await withReadingRelationsProvider(
      async (provider) => {
        await withRelationDesktopApp(
          'reading-library-cancel',
          provider.baseUrl,
          async ({ page, fixtureDir }) => {
            const { sources, collection } = await seedReadingLibrary(page, fixtureDir);
            const collectionResult = await probeScope(page, {
              kind: 'collection',
              collectionId: collection.id,
            });
            expect(collectionResult.context).toMatchObject({ sourceCount: 2, judgmentCount: 10 });
            expect(new Set(collectionResult.evidence.map((item) => item.source.ref.id))).toEqual(
              new Set(sources.slice(0, 2).map((source) => source.articleId)),
            );
            const pdf = sources.find((source) => source.kind === 'pdf')!;
            const selectedResult = await probeScope(page, {
              kind: 'sources',
              sources: [{ kind: 'article', id: pdf.articleId }],
            });
            expect(selectedResult.context).toMatchObject({ sourceCount: 1, judgmentCount: 5 });
            expect(selectedResult.evidence).toHaveLength(6);
            expect(new Set(selectedResult.evidence.map((item) => item.source.ref.id))).toEqual(
              new Set([pdf.articleId]),
            );
            expect(provider.requests).toHaveLength(0);

            const view = await openAskLibrary(page);
            const context = view.getByRole('region', { name: 'Current scope and destination' });
            await view
              .getByRole('combobox', { name: 'Evidence scope' })
              .selectOption({ label: 'Collection' });
            await view
              .getByRole('combobox', { name: 'Choose a collection' })
              .selectOption(collection.id);
            await context.getByText('2 sources · 10 saved judgments', { exact: true }).waitFor();
            await view
              .getByRole('combobox', { name: 'Evidence scope' })
              .selectOption({ label: 'Selected sources' });
            await view.getByRole('button', { name: 'Choose sources', exact: true }).click();
            const picker = page.getByRole('dialog', { name: 'Choose sources', exact: true });
            await picker.getByRole('checkbox', { name: pdf.title, exact: true }).check();
            await picker.getByRole('button', { name: 'Use selected sources' }).click();
            await context.getByText('1 sources · 5 saved judgments', { exact: true }).waitFor();
            await view.getByRole('textbox', { name: 'Your question' }).fill(readingLibraryQuestion);
            await view.getByRole('button', { name: 'Ask library', exact: true }).click();
            await view
              .getByRole('region', { name: 'Evidence from this scope' })
              .getByText(/^6 local evidence items ·/)
              .waitFor();
            expect(provider.requests).toHaveLength(0);
            await view.getByRole('button', { name: 'Understand and answer this question' }).click();
            await expect.poll(() => provider.requests.length).toBe(1);
            const input = JSON.parse(
              provider.requests[0].body.messages.find((message) => message.role === 'user')!
                .content,
            ) as SentLibraryInput;
            expect(input.evidence).toHaveLength(6);
            for (const item of input.evidence) {
              if (item.kind === 'user_judgment') expect(item.text).toContain('pdf-evidence');
              else expect(item.text).toBe(pdf.quote);
            }
            await view
              .getByText('Answering from the selected evidence…', { exact: true })
              .waitFor();
            await view.getByRole('button', { name: 'Cancel', exact: true }).click();
            await expect.poll(() => provider.requests[0].canceled).toBe(true);
            await view
              .getByText('Canceled. Local evidence remains available.', { exact: true })
              .waitFor();
            expect(await view.locator('.reading-evidence-card').count()).toBe(6);
            expect(await view.getByRole('textbox', { name: 'Your question' }).inputValue()).toBe(
              readingLibraryQuestion,
            );
            expect(await view.locator('.reading-library-answer').count()).toBe(0);
            await page.getByRole('tab', { name: 'Distillations', exact: true }).click();
            await page.getByRole('tab', { name: 'Ask library', exact: true }).click();
            expect(await view.getByRole('textbox', { name: 'Your question' }).inputValue()).toBe(
              '',
            );
            expect(await view.locator('.reading-evidence-card').count()).toBe(0);
            expect(provider.requests).toHaveLength(1);
            console.info('reading-library scope and cancel proof', {
              collectionSources: collectionResult.context.sourceCount,
              selectedSources: selectedResult.context.sourceCount,
              localEvidenceRetained: 6,
              transportCanceled: true,
              remoteRequests: provider.requests.length,
            });
          },
        );
      },
      { holdResponses: true },
    );
  });
});

async function probeScope(page: Page, scope: ReadingEvidenceScope) {
  return page.evaluate(
    async ({ selectedScope, question }) => {
      const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
      if (!desktop) throw new Error('LIBRARY_DESKTOP_API_UNAVAILABLE');
      const context = await desktop.readingMemory.library.context({ scope: selectedScope });
      const requestId = crypto.randomUUID();
      try {
        const session = await desktop.readingMemory.library.search({
          requestId,
          question,
          scope: selectedScope,
          expectedRouteRevision: context.routeRevision,
        });
        return { context, evidence: session.evidence };
      } finally {
        await desktop.readingMemory.library.cancel({ requestId });
      }
    },
    { selectedScope: scope, question: readingLibraryQuestion },
  );
}
