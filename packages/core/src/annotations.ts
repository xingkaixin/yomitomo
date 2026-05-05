import type {
  Agent,
  AgentAnnotationDensity,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
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
  readingIntent?: AgentReadingIntent | null;
  prefix?: string;
  suffix?: string;
  context?: string;
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
  annotationType?: AnnotationType,
  now = new Date().toISOString(),
): Annotation {
  const trimmed = note.trim();

  return {
    id: makeId('annotation'),
    anchor,
    author: 'user',
    annotationType,
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
  const match = findAgentAnnotationMatch(articleText, suggestion);
  if (!match) return null;

  const comment = suggestion.comment.trim();
  return {
    id: makeId('annotation'),
    anchor: createTextAnchor(articleText, match.start, match.end),
    author: 'ai',
    annotationType: suggestion.annotationType || 'key_point',
    readingIntent: suggestion.readingIntent || undefined,
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
            readingIntent: suggestion.readingIntent || undefined,
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
  };
}

function findAgentAnnotationMatch(
  articleText: string,
  suggestion: AnnotationSuggestion,
): { start: number; end: number } | null {
  const exact = suggestion.exact.trim();
  if (!exact) return null;

  for (const candidate of agentAnnotationCandidates(exact)) {
    const match = findAgentAnnotationCandidate(articleText, candidate, suggestion);
    if (match) return match;
  }

  return null;
}

function findAgentAnnotationCandidate(
  articleText: string,
  exact: string,
  suggestion: AnnotationSuggestion,
) {
  const exactMatches = findAll(articleText, exact).map((start) => ({
    start,
    end: start + exact.length,
  }));
  if (exactMatches.length > 0) {
    return selectAgentAnnotationMatch(articleText, exactMatches, exact, suggestion);
  }

  const normalizedMatches = findWhitespaceInsensitiveMatches(articleText, exact);
  if (normalizedMatches.length > 0) {
    return selectAgentAnnotationMatch(articleText, normalizedMatches, exact, suggestion);
  }

  const compactMatches = findWhitespaceAgnosticMatches(articleText, exact);
  if (compactMatches.length > 0) {
    return selectAgentAnnotationMatch(articleText, compactMatches, exact, suggestion);
  }

  return null;
}

function selectAgentAnnotationMatch(
  articleText: string,
  matches: Array<{ start: number; end: number }>,
  exact: string,
  suggestion: AnnotationSuggestion,
) {
  if (matches.length === 1) return matches[0];

  const context = suggestionContext(exact, suggestion);
  if (!context) return matches[0];

  let bestMatch = matches[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const match of matches) {
    const { start, end } = match;
    const before = articleText.slice(Math.max(0, start - context.prefix.length), start);
    const after = articleText.slice(end, end + context.suffix.length);
    const score =
      commonSuffixLength(before, context.prefix) + commonPrefixLength(after, context.suffix);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }

  return bestMatch;
}

function agentAnnotationCandidates(exact: string) {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (value: string, minLength = 12) => {
    const candidate = value.trim();
    if (candidate.length < minLength || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };

  add(exact, 1);
  for (const part of exact.split(/\.{3,}|…+/)) add(part);
  for (const part of exact.split(/\n+/)) add(part);
  for (const sentence of splitAnnotationSentences(exact)) add(sentence);

  return candidates.toSorted((left, right) => right.length - left.length);
}

function splitAnnotationSentences(text: string) {
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!'。！？；;'.includes(text[index])) continue;
    sentences.push(text.slice(start, index + 1));
    start = index + 1;
  }
  if (start < text.length) sentences.push(text.slice(start));
  return sentences;
}

function findWhitespaceInsensitiveMatches(text: string, query: string) {
  const normalizedText = normalizeTextWithMap(text);
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  if (normalizedQuery.length < 12) return [];

  const matches: Array<{ start: number; end: number }> = [];
  let index = normalizedText.text.indexOf(normalizedQuery);
  while (index >= 0) {
    const start = normalizedText.map[index];
    const end = normalizedText.map[index + normalizedQuery.length - 1] + 1;
    matches.push({ start, end });
    index = normalizedText.text.indexOf(normalizedQuery, index + normalizedQuery.length);
  }
  return matches;
}

function findWhitespaceAgnosticMatches(text: string, query: string) {
  const normalizedText = normalizeTextWithMap(text, false);
  const normalizedQuery = query.replace(/\s+/g, '');
  if (normalizedQuery.length < 12) return [];

  const matches: Array<{ start: number; end: number }> = [];
  let index = normalizedText.text.indexOf(normalizedQuery);
  while (index >= 0) {
    const start = normalizedText.map[index];
    const end = normalizedText.map[index + normalizedQuery.length - 1] + 1;
    matches.push({ start, end });
    index = normalizedText.text.indexOf(normalizedQuery, index + normalizedQuery.length);
  }
  return matches;
}

function normalizeTextWithMap(text: string, keepWhitespace = true) {
  let normalized = '';
  const map: number[] = [];
  let pendingSpaceIndex = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (keepWhitespace && normalized.length > 0) pendingSpaceIndex = index;
      continue;
    }

    if (pendingSpaceIndex >= 0) {
      normalized += ' ';
      map.push(pendingSpaceIndex);
      pendingSpaceIndex = -1;
    }
    normalized += char;
    map.push(index);
  }

  return { text: normalized.trim(), map };
}

function suggestionContext(exact: string, suggestion: AnnotationSuggestion) {
  const explicitPrefix = typeof suggestion.prefix === 'string' ? suggestion.prefix : '';
  const explicitSuffix = typeof suggestion.suffix === 'string' ? suggestion.suffix : '';
  if (explicitPrefix || explicitSuffix) return { prefix: explicitPrefix, suffix: explicitSuffix };

  if (typeof suggestion.context !== 'string') return null;
  const contextIndex = suggestion.context.indexOf(exact);
  if (contextIndex < 0) return null;

  return {
    prefix: suggestion.context.slice(0, contextIndex),
    suffix: suggestion.context.slice(contextIndex + exact.length),
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
    kind: 'annotation',
    username: annotation.agentUsername,
    nickname: annotation.agentNickname || annotation.agentUsername,
    avatar: annotation.agentAvatar || 'AI',
    annotationColor: annotation.agentAnnotationColor || annotation.color,
    annotationDensity: 'medium',
    personalityName: '自定义个性',
    temperature: 0.35,
  };
}

export function parseAnnotationSuggestions(content: string): AnnotationSuggestion[] {
  const json = content.match(/\[[\s\S]*\]/)?.[0] || content;
  const parsed = JSON.parse(json) as Array<{
    exact?: unknown;
    prefix?: unknown;
    suffix?: unknown;
    context?: unknown;
    comment?: unknown;
    type?: unknown;
    readingIntent?: unknown;
  }>;
  return parsed
    .map((item) => ({
      exact: typeof item.exact === 'string' ? item.exact : '',
      prefix: typeof item.prefix === 'string' ? item.prefix : undefined,
      suffix: typeof item.suffix === 'string' ? item.suffix : undefined,
      context: typeof item.context === 'string' ? item.context : undefined,
      comment: typeof item.comment === 'string' ? item.comment : '',
      annotationType: normalizeAnnotationType(item.type),
      readingIntent: normalizeAgentReadingIntent(item.readingIntent),
    }))
    .filter((item) => item.exact.trim().length > 0);
}

export function annotationDensityInstruction(density: AgentAnnotationDensity) {
  if (density === 'low') return '克制，约 2-4 条，只选择最高价值片段。';
  if (density === 'high') return '积极，约 7-12 条，覆盖更多值得讨论的片段。';
  return '标准，约 4-7 条，保持覆盖和克制的平衡。';
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

function normalizeAgentReadingIntent(value: unknown): AgentReadingIntent | null {
  return value === 'explain' ||
    value === 'decompose' ||
    value === 'challenge' ||
    value === 'question' ||
    value === 'connect'
    ? value
    : null;
}

function findAll(text: string, exact: string): number[] {
  const matches: number[] = [];
  let index = text.indexOf(exact);
  while (index >= 0) {
    matches.push(index);
    index = text.indexOf(exact, index + exact.length);
  }
  return matches;
}

function commonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return length;
}

function commonSuffixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 1; index <= length; index += 1) {
    if (left[left.length - index] !== right[right.length - index]) return index - 1;
  }
  return length;
}
