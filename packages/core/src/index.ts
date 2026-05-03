import type {
  Agent,
  AgentAnnotationDensity,
  Annotation,
  AnnotationType,
  ArticleRecord,
  Comment,
  PublicAgent,
  TextAnchor,
  UserProfile,
} from '@yomitomo/shared';
import { createTextAnchor, makeId } from '@yomitomo/shared';

export type AnnotationSuggestion = {
  exact: string;
  comment: string;
  annotationType?: AnnotationType | null;
};

export type MentionQuery = {
  query: string;
  start: number;
  end: number;
};

export type AnnotationPersona = {
  avatar?: string;
  fallback: string;
  nickname: string;
  username: string;
  color: string;
};

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

export const annotationTypeLabels: Record<AnnotationType, string> = {
  key_point: '关键判断',
  assumption: '前提漏洞',
  concept: '概念解释',
  question: '延伸问题',
  quote: '金句',
};

export function annotationTypeLabel(type: AnnotationType) {
  return annotationTypeLabels[type];
}

export function normalizeAnnotationType(value: unknown): AnnotationType | null {
  return value === 'key_point' ||
    value === 'assumption' ||
    value === 'concept' ||
    value === 'question' ||
    value === 'quote'
    ? value
    : null;
}

export function createUserComment(
  user: UserProfile,
  content: string,
  now = new Date().toISOString(),
): Comment {
  return {
    id: makeId('comment'),
    author: 'user',
    content: content.trim(),
    createdAt: now,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
  };
}

export function createUserAnnotation(
  anchor: TextAnchor,
  user: UserProfile,
  note: string,
  now = new Date().toISOString(),
): Annotation {
  const trimmed = note.trim();

  return {
    id: makeId('annotation'),
    anchor,
    author: 'user',
    color: user.annotationColor,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
    comments: trimmed ? [createUserComment(user, trimmed, now)] : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createAgentAnnotation(
  agent: Agent,
  articleText: string,
  suggestion: AnnotationSuggestion,
  now = new Date().toISOString(),
): Annotation | null {
  const exact = suggestion.exact.trim();
  const start = articleText.indexOf(exact);
  if (start < 0) return null;

  const comment = suggestion.comment.trim();
  return {
    id: makeId('annotation'),
    anchor: createTextAnchor(articleText, start, start + exact.length),
    author: 'ai',
    annotationType: suggestion.annotationType || 'key_point',
    color: agent.annotationColor,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    comments: comment
      ? [
          {
            id: makeId('comment'),
            author: 'ai',
            content: comment,
            createdAt: now,
            agentId: agent.id,
            agentUsername: agent.username,
            agentNickname: agent.nickname,
            agentAvatar: agent.avatar,
            agentAnnotationColor: agent.annotationColor,
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function appendAnnotationComment(
  annotations: Annotation[],
  annotationId: string,
  comment: Comment,
  now = new Date().toISOString(),
) {
  let found = false;
  const nextAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    found = true;
    return {
      ...annotation,
      comments: [...annotation.comments, comment],
      updatedAt: now,
    };
  });

  return found ? nextAnnotations : null;
}

export function updateAnnotationComment(
  annotations: Annotation[],
  annotationId: string,
  commentId: string,
  update: (comment: Comment) => Comment,
  now = new Date().toISOString(),
) {
  let found = false;
  const nextAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    found = true;
    return {
      ...annotation,
      comments: annotation.comments.map((comment) =>
        comment.id === commentId ? update(comment) : comment,
      ),
      updatedAt: now,
    };
  });

  return found ? nextAnnotations : null;
}

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

export function findMentionedAgents(content: string, agents: PublicAgent[]) {
  const byUsername = new Map(agents.map((agent) => [agent.username, agent]));
  const mentionedAgents: PublicAgent[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/@([a-zA-Z0-9_-]+)/g)) {
    const username = match[1];
    const agent = byUsername.get(username);
    if (!agent || seen.has(username)) continue;
    seen.add(username);
    mentionedAgents.push(agent);
  }

  return mentionedAgents;
}

export function getMentionQuery(content: string, caretIndex: number): MentionQuery | null {
  const prefix = content.slice(0, caretIndex);
  const match = prefix.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
  if (!match || match.index === undefined) return null;
  return {
    query: match[2],
    start: match.index + match[1].length,
    end: caretIndex,
  };
}

export function replaceMentionQuery(content: string, mentionQuery: MentionQuery, username: string) {
  return `${content.slice(0, mentionQuery.start)}@${username} ${content.slice(mentionQuery.end)}`;
}

export function annotationPersona(
  annotation: Annotation,
  userProfile: UserProfile,
  agents: PublicAgent[],
): AnnotationPersona {
  if (annotation.author === 'ai') {
    const agent = findAgentIdentity(annotation.agentId, annotation.agentUsername, agents);
    return {
      avatar: agent?.avatar || annotation.agentAvatar,
      fallback: 'AI',
      nickname: agent?.nickname || annotation.agentNickname || annotation.agentUsername || 'Agent',
      username: agent?.username || annotation.agentUsername || 'agent',
      color: agent?.annotationColor || annotation.agentAnnotationColor || annotation.color,
    };
  }

  const user = findUserIdentity(annotation.userId, userProfile);
  return {
    avatar: user?.avatar || annotation.userAvatar || userProfile.avatar,
    fallback: '我',
    nickname: user?.nickname || annotation.userNickname || userProfile.nickname,
    username: user?.username || annotation.userUsername || userProfile.username,
    color:
      user?.annotationColor ||
      annotation.userAnnotationColor ||
      annotation.color ||
      userProfile.annotationColor,
  };
}

export function commentPersona(
  comment: Comment,
  userProfile: UserProfile,
  agents: PublicAgent[],
): AnnotationPersona {
  if (comment.author === 'ai') {
    const agent = findAgentIdentity(comment.agentId, comment.agentUsername, agents);
    return {
      avatar: agent?.avatar || comment.agentAvatar,
      fallback: 'AI',
      nickname: agent?.nickname || comment.agentNickname || comment.agentUsername || 'Agent',
      username: agent?.username || comment.agentUsername || 'agent',
      color: agent?.annotationColor || comment.agentAnnotationColor || userProfile.annotationColor,
    };
  }

  const user = findUserIdentity(comment.userId, userProfile);
  return {
    avatar: user?.avatar || comment.userAvatar || userProfile.avatar,
    fallback: '我',
    nickname: user?.nickname || comment.userNickname || userProfile.nickname,
    username: user?.username || comment.userUsername || userProfile.username,
    color: user?.annotationColor || comment.userAnnotationColor || userProfile.annotationColor,
  };
}

export function annotationColor(
  annotation: Annotation,
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  return annotationPersona(annotation, userProfile, agents).color;
}

export function annotationToPublicAgent(annotation: Annotation): PublicAgent | undefined {
  if (!annotation.agentId || !annotation.agentUsername) return undefined;
  return {
    id: annotation.agentId,
    username: annotation.agentUsername,
    nickname: annotation.agentNickname || annotation.agentUsername,
    avatar: annotation.agentAvatar || 'AI',
    annotationColor: annotation.agentAnnotationColor || annotation.color,
    annotationDensity: 'medium',
    temperature: 0.35,
  };
}

export function parseAnnotationSuggestions(content: string): AnnotationSuggestion[] {
  const json = content.match(/\[[\s\S]*\]/)?.[0] || content;
  const parsed = JSON.parse(json) as Array<{ exact?: unknown; comment?: unknown; type?: unknown }>;
  return parsed
    .map((item) => ({
      exact: typeof item.exact === 'string' ? item.exact : '',
      comment: typeof item.comment === 'string' ? item.comment : '',
      annotationType: normalizeAnnotationType(item.type),
    }))
    .filter((item) => item.exact.trim().length > 0);
}

export function annotationDensityInstruction(density: AgentAnnotationDensity) {
  if (density === 'low') return '克制，约 2-4 条，只选择最高价值片段。';
  if (density === 'high') return '积极，约 7-12 条，覆盖更多值得讨论的片段。';
  return '标准，约 4-7 条，保持覆盖和克制的平衡。';
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

function findAgentIdentity(
  agentId: string | undefined,
  username: string | undefined,
  agents: PublicAgent[],
) {
  return (
    agents.find((agent) => agent.id === agentId) ||
    agents.find((agent) => agent.username === username)
  );
}

function findUserIdentity(userId: string | undefined, userProfile: UserProfile) {
  return !userId || userId === userProfile.id ? userProfile : null;
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
