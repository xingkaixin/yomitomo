import type { Page } from 'playwright-core';
import type { YomitomoDesktopApi } from '../../../src/preload';
import {
  importRelationSource,
  openRelationSource,
  saveRelationJudgment,
  waitForRelationProjection,
  type RelationSource,
} from './reading-relations-fixtures';

export const readingLibraryQuestion = 'source context';
export const readingLibraryCollectionName = 'RD971 private collection';

export async function openAskLibrary(page: Page) {
  await page.getByRole('button', { name: 'Reading memory', exact: true }).click();
  await page.getByRole('tab', { name: 'Ask library', exact: true }).click();
  const view = page.getByRole('tabpanel', { name: 'Ask library', exact: true });
  await view.getByRole('textbox', { name: 'Your question' }).waitFor();
  return view;
}

type SeededLibrarySource = RelationSource & {
  articleId: string;
  annotationId: string;
};

export async function seedReadingLibrary(page: Page, fixtureDir: string) {
  const sources: RelationSource[] = (['web', 'ebook', 'pdf'] as const).map((kind) => ({
    kind,
    title: `RD971 private ${kind} title`,
    quote: 'Reading memory connects saved judgments with source context',
  }));
  for (const source of sources) await importRelationSource(page, fixtureDir, source);

  const savedSources: SeededLibrarySource[] = [];
  for (const source of sources) {
    await openRelationSource(page, source);
    const saved = await saveRelationJudgment(page, source, libraryThought(source.kind, 0));
    savedSources.push({ ...source, articleId: saved.articleId, annotationId: saved.annotationId });
    await page.evaluate(
      async ({ articleId, annotationId, comments }) => {
        const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi })
          .yomitomoDesktop;
        if (!desktop) throw new Error('LIBRARY_DESKTOP_API_UNAVAILABLE');
        const article = await desktop.article.get(articleId);
        const annotation = article?.annotations.find((item) => item.id === annotationId);
        if (!annotation) throw new Error('LIBRARY_ANNOTATION_UNAVAILABLE');
        for (const [index, content] of comments.entries()) {
          await desktop.article.saveComment({
            articleId,
            annotationId,
            comment: {
              id: `library-comment-${articleId}-${index}`,
              author: annotation.author,
              content,
              createdAt: new Date().toISOString(),
            },
          });
        }
      },
      {
        articleId: saved.articleId,
        annotationId: saved.annotationId,
        comments: Array.from({ length: 4 }, (_, index) => libraryThought(source.kind, index + 1)),
      },
    );
    await page.getByRole('button', { name: 'Back to library' }).click();
  }

  const collection = await page.evaluate(
    async ({ name, ids }) => {
      const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
      if (!desktop) throw new Error('LIBRARY_DESKTOP_API_UNAVAILABLE');
      const { collection: createdCollection } = await desktop.library.collections.create({ name });
      await desktop.library.collections.addMembers({
        collectionId: createdCollection.id,
        members: ids.map((id) => ({ kind: 'article', id })),
      });
      return createdCollection;
    },
    {
      name: readingLibraryCollectionName,
      ids: savedSources.slice(0, 2).map((source) => source.articleId),
    },
  );
  await waitForRelationProjection(page, 3);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add content' }).waitFor();
  return { sources: savedSources, collection };
}

export async function readLibrarySavedFacts(page: Page, articleIds: string[]) {
  return page.evaluate(async (ids) => {
    const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
    if (!desktop) throw new Error('LIBRARY_DESKTOP_API_UNAVAILABLE');
    return Promise.all(
      ids.map(async (articleId) => {
        const article = await desktop.article.get(articleId);
        if (!article) throw new Error('LIBRARY_ARTICLE_UNAVAILABLE');
        return {
          articleId,
          readerChatState: article.readerChatState,
          comments: article.annotations.flatMap((annotation) =>
            annotation.comments.map((comment) => ({
              annotationId: annotation.id,
              id: comment.id,
              content: comment.content,
            })),
          ),
        };
      }),
    );
  }, articleIds);
}

function libraryThought(kind: RelationSource['kind'], index: number) {
  return `Reading memory source context keeps saved judgments reviewable: ${kind}-evidence ${index}. Original evidence matters; similarity alone cannot prove agreement. These notes do not establish outcomes beyond the cited situations.`;
}
