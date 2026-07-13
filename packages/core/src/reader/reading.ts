import type { Annotation, ArticleSummaryRecord } from '@yomitomo/shared';
import { annotationThoughtComments, annotationThreadComments } from './annotations';
import { annotationHasPublishedDistillation } from './reader-annotations';

export type ReadingStats = {
  today: ReadingStatsPeriod;
  week: ReadingStatsPeriod;
  total: ReadingStatsPeriod;
};

export type ReadingStatsPeriod = {
  articles: number;
  annotations: number;
  thoughts: number;
  comments: number;
  aiComments: number;
  distillations: number;
};

export type ReadingActivityDay = ReadingStatsPeriod & {
  date: string;
  label: string;
  score: number;
  level: number;
};

export function sortArticles(articles: ArticleSummaryRecord[]) {
  return articles.toSorted((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt));
}

export function sortAnnotations(annotations: Annotation[]) {
  return annotations.toSorted((left, right) => {
    const leftStart = Number.isFinite(left.anchor.start) ? left.anchor.start : 0;
    const rightStart = Number.isFinite(right.anchor.start) ? right.anchor.start : 0;
    if (leftStart !== rightStart) return leftStart - rightStart;
    return timestamp(left.createdAt) - timestamp(right.createdAt);
  });
}

export function computeReadingStats(
  articles: ArticleSummaryRecord[],
  now = new Date(),
): ReadingStats {
  return {
    today: countReadingStats(articles, startOfDay(now)),
    week: countReadingStats(articles, startOfWeek(now)),
    total: countReadingStats(articles, null),
  };
}

export function computeReadingActivityDays(
  articles: ArticleSummaryRecord[],
  days = 70,
  now = new Date(),
): ReadingActivityDay[] {
  const start = startOfDay(now);
  start.setDate(start.getDate() - days + 1);
  const items = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return emptyActivityDay(date);
  });
  const byDate = new Map(items.map((item) => [item.date, item]));

  const addToDay = (value: string, update: (day: ReadingActivityDay) => void) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date < start) return;
    const day = byDate.get(dateKey(date));
    if (day) update(day);
  };

  for (const article of articles) {
    addToDay(article.updatedAt, (day) => {
      day.articles += 1;
      day.score += 1;
    });
    if (!articleHasCompleteAnnotationDetails(article)) {
      addToDay(article.updatedAt, (day) => {
        const counts = articleSummaryCounts(article);
        day.annotations += counts.annotations;
        day.thoughts += counts.thoughts;
        day.comments += counts.comments;
        day.aiComments += counts.aiComments;
        day.distillations += counts.distillations;
        day.score += counts.annotations + counts.comments + counts.distillations;
      });
      continue;
    }
    for (const annotation of article.annotations) {
      addToDay(annotation.createdAt, (day) => {
        day.annotations += 1;
        day.score += 1;
      });
      for (const comment of annotationThreadComments(annotation)) {
        addToDay(comment.createdAt, (day) => {
          day.comments += 1;
          day.score += 1;
        });
      }
      for (const comment of annotationThoughtComments(annotation)) {
        addToDay(comment.createdAt, (day) => {
          day.thoughts += 1;
        });
      }
      for (const contribution of aiContributionDates(annotation)) {
        addToDay(contribution, (day) => {
          day.aiComments += 1;
        });
      }
      if (annotationHasPublishedDistillation(annotation)) {
        addToDay(distillationActivityDate(annotation), (day) => {
          day.distillations += 1;
          day.score += 1;
        });
      }
    }
  }

  const maxScore = Math.max(...items.map((item) => item.score));
  for (const item of items) {
    item.level = activityLevel(item.score, maxScore);
  }
  return items;
}

export function timestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function countReadingStats(
  articles: ArticleSummaryRecord[],
  since: Date | null,
): ReadingStatsPeriod {
  const inPeriod = (value: string) => {
    if (!since) return true;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= since;
  };

  return articles.reduce(
    (result, article) => {
      if (!articleHasCompleteAnnotationDetails(article)) {
        const counts = inPeriod(article.updatedAt) ? articleSummaryCounts(article) : null;
        return {
          articles: result.articles + (inPeriod(article.updatedAt) ? 1 : 0),
          annotations: result.annotations + (counts?.annotations || 0),
          thoughts: result.thoughts + (counts?.thoughts || 0),
          comments: result.comments + (counts?.comments || 0),
          aiComments: result.aiComments + (counts?.aiComments || 0),
          distillations: result.distillations + (counts?.distillations || 0),
        };
      }

      const annotations = article.annotations.filter((annotation) =>
        inPeriod(annotation.createdAt),
      );
      const comments = article.annotations.flatMap((annotation) =>
        annotationThreadComments(annotation).filter((comment) => inPeriod(comment.createdAt)),
      );
      const thoughts = article.annotations.flatMap((annotation) =>
        annotationThoughtComments(annotation).filter((comment) => inPeriod(comment.createdAt)),
      );
      const distillations = article.annotations.filter(
        (annotation) =>
          annotationHasPublishedDistillation(annotation) &&
          inPeriod(distillationActivityDate(annotation)),
      );
      const aiContributions = article.annotations.flatMap((annotation) =>
        aiContributionDates(annotation).filter(inPeriod),
      );

      return {
        articles: result.articles + (inPeriod(article.updatedAt) ? 1 : 0),
        annotations: result.annotations + annotations.length,
        thoughts: result.thoughts + thoughts.length,
        comments: result.comments + comments.length,
        aiComments: result.aiComments + aiContributions.length,
        distillations: result.distillations + distillations.length,
      };
    },
    { articles: 0, annotations: 0, thoughts: 0, comments: 0, aiComments: 0, distillations: 0 },
  );
}

function articleHasCompleteAnnotationDetails(article: ArticleSummaryRecord) {
  return (article.annotationCount ?? article.annotations.length) <= article.annotations.length;
}

function articleSummaryCounts(article: ArticleSummaryRecord) {
  return {
    annotations: article.annotationCount ?? article.annotations.length,
    thoughts:
      article.thoughtCount ??
      article.commentCount ??
      article.annotations.reduce(
        (count, annotation) =>
          count + annotation.comments.filter((comment) => !comment.replyTo).length,
        0,
      ),
    comments:
      article.discussionCommentCount ??
      article.annotations.reduce(
        (count, annotation) => count + annotationThreadComments(annotation).length,
        0,
      ),
    aiComments:
      article.aiCommentCount ??
      article.annotations.reduce(
        (count, annotation) => count + aiContributionDates(annotation).length,
        0,
      ),
    distillations:
      article.distillationCount ??
      article.annotations.filter(annotationHasPublishedDistillation).length,
  };
}

function aiContributionDates(annotation: Annotation) {
  const dates: string[] = [];
  const seenCommentIds = new Set<string>();
  for (const comment of [
    ...annotationThreadComments(annotation),
    ...annotationThoughtComments(annotation),
  ]) {
    if (comment.author !== 'ai') continue;
    if (seenCommentIds.has(comment.id)) continue;
    seenCommentIds.add(comment.id);
    dates.push(comment.createdAt);
  }
  for (const session of annotation.distillation?.reviewSessions || []) {
    for (const message of session.messages) {
      if (message.author === 'ai') dates.push(message.createdAt);
    }
  }
  return dates;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function emptyActivityDay(date: Date): ReadingActivityDay {
  return {
    date: dateKey(date),
    label: `${date.getMonth() + 1}/${date.getDate()}`,
    articles: 0,
    annotations: 0,
    thoughts: 0,
    comments: 0,
    aiComments: 0,
    distillations: 0,
    score: 0,
    level: 0,
  };
}

function distillationActivityDate(annotation: Annotation) {
  return (
    annotation.distillation?.publishedAt ||
    annotation.distillation?.updatedAt ||
    annotation.updatedAt ||
    annotation.createdAt
  );
}

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function activityLevel(score: number, maxScore: number) {
  if (score === 0 || maxScore === 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((score / maxScore) * 4)));
}
