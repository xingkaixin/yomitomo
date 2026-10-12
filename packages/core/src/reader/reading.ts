import type {
  Annotation,
  ArticleActivityDates,
  ArticleRecord,
  ArticleStatsRecord,
  ArticleSummaryRecord,
} from '@yomitomo/shared';
import { annotationThoughtComments, annotationThreadComments } from './annotations';
import { annotationAiContributionDates, articleCounts } from './article-counts';
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

type ReadingStatsArticle = ArticleRecord | ArticleSummaryRecord | ArticleStatsRecord;

export function sortArticles<T extends ReadingStatsArticle>(articles: T[]) {
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
  articles: ReadingStatsArticle[],
  now = new Date(),
): ReadingStats {
  return {
    today: countReadingStats(articles, startOfDay(now)),
    week: countReadingStats(articles, startOfWeek(now)),
    total: countReadingStats(articles, null),
  };
}

export function computeReadingActivityDays(
  articles: ReadingStatsArticle[],
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
    if ('counts' in article && !('activityDates' in article)) {
      addToDay(article.updatedAt, (day) => {
        const counts = articleCounts(article);
        day.annotations += counts.annotationCount;
        day.thoughts += counts.thoughtCount;
        day.comments += counts.discussionCommentCount;
        day.aiComments += counts.aiCommentCount;
        day.distillations += counts.distillationCount;
        day.score +=
          counts.annotationCount + counts.discussionCommentCount + counts.distillationCount;
      });
      continue;
    }
    const dates = articleActivityDates(article);
    for (const value of dates.annotations) {
      addToDay(value, (day) => {
        day.annotations += 1;
        day.score += 1;
      });
    }
    for (const value of dates.discussionComments) {
      addToDay(value, (day) => {
        day.comments += 1;
        day.score += 1;
      });
    }
    for (const value of dates.thoughts) {
      addToDay(value, (day) => {
        day.thoughts += 1;
      });
    }
    for (const value of dates.aiComments) {
      addToDay(value, (day) => {
        day.aiComments += 1;
      });
    }
    for (const value of dates.distillations) {
      addToDay(value, (day) => {
        day.distillations += 1;
        day.score += 1;
      });
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
  articles: ReadingStatsArticle[],
  since: Date | null,
): ReadingStatsPeriod {
  const inPeriod = (value: string) => {
    if (!since) return true;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= since;
  };

  return articles.reduce(
    (result, article) => {
      if ('counts' in article && !('activityDates' in article)) {
        const counts = inPeriod(article.updatedAt) ? articleCounts(article) : null;
        return {
          articles: result.articles + (inPeriod(article.updatedAt) ? 1 : 0),
          annotations: result.annotations + (counts?.annotationCount || 0),
          thoughts: result.thoughts + (counts?.thoughtCount || 0),
          comments: result.comments + (counts?.discussionCommentCount || 0),
          aiComments: result.aiComments + (counts?.aiCommentCount || 0),
          distillations: result.distillations + (counts?.distillationCount || 0),
        };
      }

      const dates = articleActivityDates(article);
      return {
        articles: result.articles + (inPeriod(article.updatedAt) ? 1 : 0),
        annotations: result.annotations + dates.annotations.filter(inPeriod).length,
        thoughts: result.thoughts + dates.thoughts.filter(inPeriod).length,
        comments: result.comments + dates.discussionComments.filter(inPeriod).length,
        aiComments: result.aiComments + dates.aiComments.filter(inPeriod).length,
        distillations: result.distillations + dates.distillations.filter(inPeriod).length,
      };
    },
    { articles: 0, annotations: 0, thoughts: 0, comments: 0, aiComments: 0, distillations: 0 },
  );
}

function articleActivityDates(article: ArticleRecord | ArticleStatsRecord): ArticleActivityDates {
  if ('activityDates' in article) return article.activityDates;
  const { annotations } = article;
  return {
    annotations: annotations.map((annotation) => annotation.createdAt),
    thoughts: annotations.flatMap((annotation) =>
      annotationThoughtComments(annotation).map((comment) => comment.createdAt),
    ),
    discussionComments: annotations.flatMap((annotation) =>
      annotationThreadComments(annotation).map((comment) => comment.createdAt),
    ),
    aiComments: annotations.flatMap(annotationAiContributionDates),
    distillations: annotations
      .filter(annotationHasPublishedDistillation)
      .map(distillationActivityDate),
  };
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
