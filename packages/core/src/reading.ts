import type { Annotation, ArticleRecord, Comment } from '@yomitomo/shared';
import { annotationTypeLabel } from './annotations';

export type ReadingCardSection = {
  title: string;
  items: string[];
};

export type ReadingCardStats = {
  annotations: number;
  comments: number;
  aiContributions: number;
};

export type ReadingCardComment = {
  id: string;
  author: Comment['author'];
  authorLabel: string;
  content: string;
  createdAt: string;
};

export type ReadingCardEvidenceUnit = {
  id: string;
  index: number;
  quote: string;
  context: string;
  annotationType: string;
  annotationAuthor: Annotation['author'];
  annotationAuthorLabel: string;
  createdAt: string;
  comments: ReadingCardComment[];
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

export type ReadingActivityDay = ReadingStatsPeriod & {
  date: string;
  label: string;
  cards: number;
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

export function buildReadingCard(article: ArticleRecord, articleText = '') {
  const stats = buildReadingCardStats(article);
  const units = buildReadingCardEvidenceUnits(article);
  const sections = buildReadingCardSections(article, articleText);
  const lines = [
    `# ${article.title}`,
    '',
    `来源：${article.canonicalUrl || article.url}`,
    ...(article.byline ? [`作者：${article.byline}`] : []),
    `更新时间：${formatDateTime(article.updatedAt)}`,
    `批注：${stats.annotations} 条 · 评论：${stats.comments} 条 · 助手参与：${stats.aiContributions} 条`,
    '',
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`, '');
    if (section.title === '阅读轨迹') {
      if (units.length > 0) {
        for (const unit of units) lines.push(...formatEvidenceUnit(unit), '');
      } else {
        lines.push('- 暂无', '');
      }
      continue;
    }

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
  _articleText = '',
): ReadingCardSection[] {
  const units = buildReadingCardEvidenceUnits(article);
  const userUnits = units.filter(
    (unit) =>
      unit.annotationAuthor === 'user' ||
      unit.comments.some((comment) => comment.author === 'user'),
  );
  const aiUnits = units.filter(
    (unit) =>
      unit.annotationAuthor === 'ai' || unit.comments.some((comment) => comment.author === 'ai'),
  );
  const questions = units.flatMap((unit) => {
    const commentQuestions = unit.comments
      .filter((comment) => /[?？]/.test(comment.content))
      .map(
        (comment) =>
          `${comment.authorLabel}：${lineText(comment.content)}（原文：${compactText(unit.quote, 80)}）`,
      );
    if (unit.annotationType === annotationTypeLabel('question')) {
      return [`${unit.annotationType}：${compactText(unit.quote, 120)}`, ...commentQuestions];
    }
    return commentQuestions;
  });

  return [
    {
      title: '阅读轨迹',
      items: units.map(
        (unit) =>
          `${unit.index}. ${unit.annotationType ? `【${unit.annotationType}】` : ''}【${unit.annotationAuthorLabel}】“${compactText(unit.quote, 120)}”`,
      ),
    },
    {
      title: '我的关注',
      items: userUnits.map((unit) => formatFocusedUnit(unit, 'user')),
    },
    {
      title: '助手补充',
      items: aiUnits.map((unit) => formatFocusedUnit(unit, 'ai')),
    },
    {
      title: '后续问题',
      items: questions,
    },
  ];
}

export function buildReadingCardEvidenceUnits(article: ArticleRecord): ReadingCardEvidenceUnit[] {
  return sortAnnotations(article.annotations).map((annotation, index) => ({
    id: annotation.id,
    index: index + 1,
    quote: lineText(annotation.anchor.exact),
    context: lineText(
      [annotation.anchor.prefix, annotation.anchor.exact, annotation.anchor.suffix]
        .filter(Boolean)
        .join(' '),
    ),
    annotationType: annotation.annotationType ? annotationTypeLabel(annotation.annotationType) : '',
    annotationAuthor: annotation.author,
    annotationAuthorLabel: annotationLabel(annotation),
    createdAt: annotation.createdAt,
    comments: annotation.comments
      .toSorted((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt))
      .map((comment) => ({
        id: comment.id,
        author: comment.author,
        authorLabel: commentLabel(comment),
        content: lineText(comment.content),
        createdAt: comment.createdAt,
      })),
  }));
}

export function buildReadingCardStats(article: ArticleRecord): ReadingCardStats {
  const comments = article.annotations.flatMap((annotation) => annotation.comments);
  return {
    annotations: article.annotations.length,
    comments: comments.length,
    aiContributions:
      article.annotations.filter((annotation) => annotation.author === 'ai').length +
      comments.filter((comment) => comment.author === 'ai').length,
  };
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
    addToDay(article.readingCard?.createdAt || '', (day) => {
      day.cards += 1;
      day.score += 2;
    });
    for (const annotation of article.annotations) {
      addToDay(annotation.createdAt, (day) => {
        day.annotations += 1;
        day.score += 1;
      });
      for (const comment of annotation.comments) {
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

export function compactText(value: string, limit: number) {
  const text = lineText(value);
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
      const comments = article.annotations.flatMap((annotation) =>
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

function emptyActivityDay(date: Date): ReadingActivityDay {
  return {
    date: dateKey(date),
    label: `${date.getMonth() + 1}/${date.getDate()}`,
    articles: 0,
    annotations: 0,
    comments: 0,
    aiComments: 0,
    cards: 0,
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function lineText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function annotationLabel(annotation: Annotation) {
  if (annotation.author === 'ai')
    return annotation.agentNickname || annotation.agentUsername || '助手';
  return annotation.userNickname || annotation.userUsername || '我';
}

function commentLabel(comment: Comment) {
  if (comment.author === 'ai') return comment.agentNickname || comment.agentUsername || '助手';
  return comment.userNickname || comment.userUsername || '我';
}

function formatFocusedUnit(unit: ReadingCardEvidenceUnit, author: Comment['author']) {
  const comments = unit.comments
    .filter((comment) => comment.author === author)
    .map((comment) => `${comment.authorLabel}：${comment.content}`);
  const source =
    unit.annotationAuthor === author ? [`${unit.annotationAuthorLabel}标记了这段原文`] : [];
  return [
    `${unit.annotationType ? `【${unit.annotationType}】` : ''}“${compactText(unit.quote, 100)}”`,
    ...source,
    ...comments,
  ].join('；');
}

function formatEvidenceUnit(unit: ReadingCardEvidenceUnit) {
  const title = `${unit.index}. ${unit.annotationType ? `【${unit.annotationType}】` : ''}【${unit.annotationAuthorLabel}】“${unit.quote}”`;
  if (unit.comments.length === 0) return [title];
  return [
    title,
    ...unit.comments.map(
      (comment) =>
        `   - ${comment.authorLabel}（${formatDateTime(comment.createdAt)}）：${comment.content}`,
    ),
  ];
}
