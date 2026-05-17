import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import { annotationThreadComments } from './annotations';

export type ReadingStats = {
  today: ReadingStatsPeriod;
  week: ReadingStatsPeriod;
  total: ReadingStatsPeriod;
};

export type ReadingStatsPeriod = {
  articles: number;
  annotations: number;
  comments: number;
  aiComments: number;
};

export type ReadingActivityDay = ReadingStatsPeriod & {
  date: string;
  label: string;
  score: number;
  level: number;
};

export function sortArticles(articles: ArticleRecord[]) {
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

export function computeReadingStats(articles: ArticleRecord[], now = new Date()): ReadingStats {
  return {
    today: countReadingStats(articles, startOfDay(now)),
    week: countReadingStats(articles, startOfWeek(now)),
    total: countReadingStats(articles, null),
  };
}

export function computeReadingActivityDays(
  articles: ArticleRecord[],
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
    for (const annotation of article.annotations) {
      addToDay(annotation.createdAt, (day) => {
        day.annotations += 1;
        day.score += 1;
      });
      for (const comment of annotationThreadComments(annotation)) {
        addToDay(comment.createdAt, (day) => {
          day.comments += 1;
          day.score += 1;
          if (comment.author === 'ai') day.aiComments += 1;
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

function countReadingStats(articles: ArticleRecord[], since: Date | null): ReadingStatsPeriod {
  const inPeriod = (value: string) => {
    if (!since) return true;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= since;
  };

  return articles.reduce(
    (result, article) => {
      const annotations = article.annotations.filter((annotation) =>
        inPeriod(annotation.createdAt),
      );
      const comments = article.annotations.flatMap((annotation) =>
        annotationThreadComments(annotation).filter((comment) => inPeriod(comment.createdAt)),
      );

      return {
        articles: result.articles + (inPeriod(article.updatedAt) ? 1 : 0),
        annotations: result.annotations + annotations.length,
        comments: result.comments + comments.length,
        aiComments:
          result.aiComments + comments.filter((comment) => comment.author === 'ai').length,
      };
    },
    { articles: 0, annotations: 0, comments: 0, aiComments: 0 },
  );
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
    comments: 0,
    aiComments: 0,
    score: 0,
    level: 0,
  };
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
