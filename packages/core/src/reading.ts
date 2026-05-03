import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import { annotationTypeLabel } from './annotations';

export type ReadingCardSection = {
  title: string;
  items: string[];
};

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

export function buildReadingCard(article: ArticleRecord, articleText = '') {
  const sections = buildReadingCardSections(article, articleText);
  const lines = [
    `# ${article.title}`,
    '',
    `来源：${article.canonicalUrl || article.url}`,
    `更新时间：${formatDateTime(article.updatedAt)}`,
    '',
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`, '');
    if (section.items.length > 0) {
      for (const item of section.items) lines.push(`- ${item}`);
    } else {
      lines.push('- 暂无');
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function buildReadingCardSections(
  article: ArticleRecord,
  articleText = '',
): ReadingCardSection[] {
  const comments = article.annotations.flatMap((annotation) =>
    annotation.comments.map((comment) => ({
      annotation,
      comment,
    })),
  );
  const userComments = comments.filter((item) => item.comment.author === 'user');
  const aiComments = comments.filter((item) => item.comment.author === 'ai');
  const questions = comments.filter((item) => /[?？]/.test(item.comment.content));

  return [
    {
      title: '文章快照',
      items: articleText ? [compactText(articleText, 260)] : [],
    },
    {
      title: '关键原文',
      items: article.annotations
        .slice(0, 6)
        .map(
          (annotation) =>
            `${annotation.annotationType ? `【${annotationTypeLabel(annotation.annotationType)}】` : ''}“${compactText(annotation.anchor.exact, 120)}”`,
        ),
    },
    {
      title: '我的批注',
      items: userComments
        .slice(0, 6)
        .map(
          ({ annotation, comment }) =>
            `${compactText(comment.content, 140)}（原文：${compactText(annotation.anchor.exact, 80)}）`,
        ),
    },
    {
      title: '助手补充',
      items: aiComments
        .slice(0, 6)
        .map(
          ({ annotation, comment }) =>
            `${compactText(comment.content, 160)}（原文：${compactText(annotation.anchor.exact, 80)}）`,
        ),
    },
    {
      title: '后续问题',
      items: questions.slice(0, 6).map(({ comment }) => compactText(comment.content, 140)),
    },
  ];
}

export function computeReadingStats(articles: ArticleRecord[], now = new Date()): ReadingStats {
  return {
    today: countReadingStats(articles, startOfDay(now)),
    week: countReadingStats(articles, startOfWeek(now)),
    total: countReadingStats(articles, null),
  };
}

export function compactText(value: string, limit: number) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
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
      const comments = annotations.flatMap((annotation) =>
        annotation.comments.filter((comment) => inPeriod(comment.createdAt)),
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
