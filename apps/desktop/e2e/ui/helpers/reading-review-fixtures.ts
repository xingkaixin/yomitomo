import { join } from 'node:path';
import SQLiteDatabase from 'better-sqlite3';
import type { ReadingReviewEvent } from '@yomitomo/shared';
import type { Locator, Page } from 'playwright-core';
import type { YomitomoDesktopApi } from '../../../src/preload';
import type { DesktopE2eApp } from './electron-app';
import {
  importRelationSource,
  openRelationSource,
  saveRelationJudgment,
  waitForRelationProjection,
  type RelationSource,
} from './reading-relations-fixtures';

export type SavedReviewSource = RelationSource & {
  articleId: string;
  annotationId: string;
  commentId: string;
  judgment: string;
};

export async function openReviewQueue(page: Page) {
  await page.getByRole('button', { name: 'Reading memory', exact: true }).click();
  await page.getByRole('tab', { name: 'Reconsideration', exact: true }).click();
  return waitForReviewQueue(page);
}

export async function reopenReviewQueue(page: Page) {
  await page.getByRole('tab', { name: 'Distillations', exact: true }).click();
  await page.getByRole('tab', { name: 'Reconsideration', exact: true }).click();
  return waitForReviewQueue(page);
}

async function waitForReviewQueue(page: Page) {
  const view = page.getByRole('tabpanel', { name: 'Reconsideration', exact: true });
  await view.getByRole('heading', { name: 'Reconsider judgments', exact: true }).waitFor();
  await view.getByRole('button', { name: 'Start review', exact: true }).first().waitFor();
  return view;
}

export async function startReview(view: Locator, title: string) {
  await view
    .getByRole('article', { name: title, exact: true })
    .first()
    .getByRole('button', { name: 'Start review', exact: true })
    .click();
  await view.getByRole('textbox', { name: 'Your current view', exact: true }).waitFor();
}

export async function revealReview(view: Locator, answer: string) {
  if (answer) {
    await view.getByRole('textbox', { name: 'Your current view', exact: true }).fill(answer);
    await view.getByRole('button', { name: 'Reveal earlier judgment', exact: true }).click();
  } else {
    await view.getByRole('button', { name: 'I need more evidence', exact: true }).click();
  }
  await view.getByRole('region', { name: 'Earlier effective judgment', exact: true }).waitFor();
}

export async function seedReviewSources(
  page: Page,
  fixtureDir: string,
  kinds: RelationSource['kind'][],
) {
  const sources: SavedReviewSource[] = [];
  for (const kind of kinds) {
    const source: RelationSource = {
      kind,
      title: `RD972 private ${kind} title`,
      quote: 'Reading memory connects saved judgments with source context',
    };
    const judgment = `My earlier ${kind} judgment: source context supports this original conclusion.`;
    await importRelationSource(page, fixtureDir, source);
    await openRelationSource(page, source);
    const saved = await saveRelationJudgment(page, source, judgment);
    sources.push({
      ...source,
      ...saved,
      commentId: `relation-comment-${saved.articleId}`,
      judgment,
    });
    await page.getByRole('button', { name: 'Back to library' }).click();
  }
  await waitForRelationProjection(page, sources.length);
  return sources;
}

export function readReviewFacts(userDataDir: string) {
  const database = new SQLiteDatabase(join(userDataDir, 'yomitomo.sqlite'), {
    fileMustExist: true,
    readonly: true,
  });
  try {
    return {
      comments: database.prepare('SELECT * FROM comments ORDER BY id').all(),
      reviews: database
        .prepare(
          `SELECT id, article_id AS articleId, annotation_id AS annotationId,
asset_type AS assetType, asset_id AS assetId, asset_version AS assetVersion,
judgment_snapshot AS judgmentSnapshot, judgment_digest AS judgmentDigest,
previous_review_id AS previousReviewId, decision, answer, created_at AS createdAt
FROM reading_memory_reviews ORDER BY created_at, id`,
        )
        .all() as ReadingReviewEvent[],
    };
  } finally {
    database.close();
  }
}

export async function withReviewWritesBlocked(userDataDir: string, run: () => Promise<void>) {
  const database = new SQLiteDatabase(join(userDataDir, 'yomitomo.sqlite'), {
    fileMustExist: true,
  });
  try {
    database.exec(`CREATE TRIGGER e2e_reject_review BEFORE INSERT ON reading_memory_reviews
BEGIN SELECT RAISE(ABORT, 'RD972 controlled review write failure'); END`);
    await run();
  } finally {
    try {
      database.exec('DROP TRIGGER IF EXISTS e2e_reject_review');
    } finally {
      database.close();
    }
  }
}

export async function changeReviewComment(
  page: Page,
  source: Pick<SavedReviewSource, 'articleId' | 'annotationId' | 'commentId'>,
  content: string,
) {
  await page.evaluate(
    async ({ articleId, annotationId, commentId, content: nextContent }) => {
      const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
      if (!desktop) throw new Error('REVIEW_DESKTOP_API_UNAVAILABLE');
      const article = await desktop.article.get(articleId);
      const comment = article?.annotations
        .find((item) => item.id === annotationId)
        ?.comments.find((item) => item.id === commentId);
      if (!comment) throw new Error('REVIEW_COMMENT_UNAVAILABLE');
      await desktop.article.saveComment({
        articleId,
        annotationId,
        comment: { ...comment, content: nextContent },
      });
    },
    { ...source, content },
  );
}

export async function openReviewDiscussion(
  { app, page }: Pick<DesktopE2eApp, 'app' | 'page'>,
  source: Pick<SavedReviewSource, 'articleId' | 'annotationId'>,
) {
  const discussionPromise = app.waitForEvent('window');
  await page.evaluate(async ({ articleId, annotationId }) => {
    const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
    if (!desktop) throw new Error('REVIEW_DESKTOP_API_UNAVAILABLE');
    await desktop.annotations.discussion.open({ articleId, annotationId });
  }, source);
  const discussion = await discussionPromise;
  await discussion.getByRole('region', { name: 'Annotation discussion window' }).waitFor();
  return discussion;
}
