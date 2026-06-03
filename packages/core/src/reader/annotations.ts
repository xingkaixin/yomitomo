import type {
  Agent,
  AgentAnnotationDensity,
  AnnotationConfidence,
  AnnotationEvidenceSource,
  AnnotationMove,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  Comment,
  EpubBookIndex,
  PublicAgent,
  TextAnchor,
  UserProfile,
} from '@yomitomo/shared';
import { createTextAnchor, makeId } from '@yomitomo/shared';
import { createEpubTextAnchor } from '../epub/ebook-index';
import {
  performanceElapsedMs,
  performanceStart,
  type PerformanceTimingLogger,
} from '../performance';

export type AnnotationSuggestion = {
  exact: string;
  comment: string;
  annotationType?: AnnotationType | null;
  readingIntent?: AgentReadingIntent | null;
  moveType?: AnnotationMove | null;
  whyHere?: string;
  evidenceUsed?: AnnotationEvidenceSource[];
  confidence?: AnnotationConfidence | null;
  shouldShow?: boolean;
  prefix?: string;
  suffix?: string;
  context?: string;
};

export type MentionQuery = {
  query: string;
  start: number;
  end: number;
};

export type CreateUserAnnotationOptions = {
  now?: string;
  replyTo?: string;
  readingIntent?: AgentReadingIntent;
};

export type CreateAgentAnnotationOptions = {
  ebookIndex?: EpubBookIndex;
  allowedTextStart?: number;
  allowedTextEnd?: number;
  allowedSegmentIds?: string[];
  allowedParagraphIds?: string[];
  performanceLogger?: PerformanceTimingLogger;
};

type AgentAnnotationMatchStrategy = 'exact' | 'whitespace_insensitive' | 'whitespace_agnostic';

type AgentAnnotationMatchStats = {
  candidateCount: number;
  candidatesTried: number;
  exactMatchCount: number;
  allowedExactMatchCount: number;
  whitespaceInsensitiveMatchCount: number;
  allowedWhitespaceInsensitiveMatchCount: number;
  whitespaceAgnosticMatchCount: number;
  allowedWhitespaceAgnosticMatchCount: number;
};

type AgentAnnotationSearchScope = {
  text: string;
  offset: number;
};

type AgentAnnotationNormalizedText = ReturnType<typeof normalizeTextWithMap>;

type AgentAnnotationMatcherContext = {
  searchScope: AgentAnnotationSearchScope;
  whitespaceInsensitiveText: AgentAnnotationNormalizedText;
  whitespaceAgnosticText: AgentAnnotationNormalizedText;
  allowedSegmentIds?: Set<string>;
  allowedParagraphIds?: Set<string>;
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
  options: CreateUserAnnotationOptions = {},
): Comment {
  const now = options.now || new Date().toISOString();

  return {
    id: makeId('comment'),
    author: 'user',
    content: content.trim(),
    createdAt: now,
    replyTo: options.replyTo,
    readingIntent: options.readingIntent,
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
  options: CreateUserAnnotationOptions = {},
): Annotation {
  const now = options.now || new Date().toISOString();
  const trimmed = note.trim();

  return {
    id: makeId('annotation'),
    anchor,
    author: 'user',
    annotationType,
    readingIntent: options.readingIntent,
    color: user.annotationColor,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
    comments: trimmed ? [createUserComment(user, trimmed, { ...options, now })] : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function annotationPrimaryComment(annotation: Annotation): Comment | null {
  const comment = annotation.comments[0];
  if (!comment) return null;
  if (comment.author !== annotation.author) return null;
  if (comment.createdAt !== annotation.createdAt) return null;
  return comment;
}

export function annotationThreadComments(annotation: Annotation): Comment[] {
  return annotationPrimaryComment(annotation) ? annotation.comments.slice(1) : annotation.comments;
}

export function annotationThoughtComments(annotation: Annotation): Comment[] {
  return annotation.comments.filter((comment) => !comment.replyTo);
}

export function createAgentAnnotation(
  agent: Agent,
  articleText: string,
  suggestion: AnnotationSuggestion,
  now = new Date().toISOString(),
  options: CreateAgentAnnotationOptions = {},
): Annotation | null {
  const match = findAgentAnnotationMatch(articleText, suggestion, options);
  if (!match) return null;

  const comment = suggestion.comment.trim();
  return {
    id: makeId('annotation'),
    anchor: createAnnotationAnchor(articleText, match.start, match.end, options),
    author: 'ai',
    annotationType: suggestion.annotationType || 'key_point',
    readingIntent: suggestion.readingIntent || undefined,
    moveType: suggestion.moveType || undefined,
    whyHere: suggestion.whyHere || undefined,
    evidenceUsed: suggestion.evidenceUsed?.length ? suggestion.evidenceUsed : undefined,
    confidence: suggestion.confidence || undefined,
    shouldShow: typeof suggestion.shouldShow === 'boolean' ? suggestion.shouldShow : undefined,
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

function createAnnotationAnchor(
  articleText: string,
  start: number,
  end: number,
  options: CreateAgentAnnotationOptions,
) {
  return options.ebookIndex
    ? createEpubTextAnchor(options.ebookIndex, articleText, start, end)
    : createTextAnchor(articleText, start, end);
}

function findAgentAnnotationMatch(
  articleText: string,
  suggestion: AnnotationSuggestion,
  options: CreateAgentAnnotationOptions,
): { start: number; end: number } | null {
  const startedAt = performanceStart();
  const exact = suggestion.exact.trim();
  if (!exact) {
    logAgentAnnotationMatchTiming(articleText, exact, options, startedAt, null, undefined, {
      candidateCount: 0,
      candidatesTried: 0,
      exactMatchCount: 0,
      allowedExactMatchCount: 0,
      whitespaceInsensitiveMatchCount: 0,
      allowedWhitespaceInsensitiveMatchCount: 0,
      whitespaceAgnosticMatchCount: 0,
      allowedWhitespaceAgnosticMatchCount: 0,
    });
    return null;
  }

  const candidates = agentAnnotationCandidates(exact);
  const stats: AgentAnnotationMatchStats = {
    candidateCount: candidates.length,
    candidatesTried: 0,
    exactMatchCount: 0,
    allowedExactMatchCount: 0,
    whitespaceInsensitiveMatchCount: 0,
    allowedWhitespaceInsensitiveMatchCount: 0,
    whitespaceAgnosticMatchCount: 0,
    allowedWhitespaceAgnosticMatchCount: 0,
  };

  const matcherContext = createAgentAnnotationMatcherContext(articleText, options);
  for (const candidate of candidates) {
    const match = findAgentAnnotationCandidate(
      articleText,
      matcherContext,
      candidate,
      suggestion,
      options,
      stats,
    );
    if (match) {
      logAgentAnnotationMatchTiming(articleText, exact, options, startedAt, match, match.strategy, {
        ...stats,
      });
      return match;
    }
  }

  logAgentAnnotationMatchTiming(articleText, exact, options, startedAt, null, undefined, stats);
  return null;
}

function findAgentAnnotationCandidate(
  articleText: string,
  matcherContext: AgentAnnotationMatcherContext,
  exact: string,
  suggestion: AnnotationSuggestion,
  options: CreateAgentAnnotationOptions,
  stats: AgentAnnotationMatchStats,
) {
  stats.candidatesTried += 1;
  const { searchScope } = matcherContext;
  const exactMatches = findAll(searchScope.text, exact).map((start) => ({
    start: searchScope.offset + start,
    end: searchScope.offset + start + exact.length,
  }));
  stats.exactMatchCount += exactMatches.length;
  const allowedExactMatches = allowedAgentAnnotationMatches(exactMatches, options, matcherContext);
  stats.allowedExactMatchCount += allowedExactMatches.length;
  if (allowedExactMatches.length > 0) {
    return {
      ...selectAgentAnnotationMatch(articleText, allowedExactMatches, exact, suggestion),
      strategy: 'exact' as const,
    };
  }

  const allNormalizedMatches = offsetAgentAnnotationMatches(
    findWhitespaceInsensitiveMatches(matcherContext.whitespaceInsensitiveText, exact),
    searchScope.offset,
  );
  stats.whitespaceInsensitiveMatchCount += allNormalizedMatches.length;
  const normalizedMatches = allowedAgentAnnotationMatches(
    allNormalizedMatches,
    options,
    matcherContext,
  );
  stats.allowedWhitespaceInsensitiveMatchCount += normalizedMatches.length;
  if (normalizedMatches.length > 0) {
    return {
      ...selectAgentAnnotationMatch(articleText, normalizedMatches, exact, suggestion),
      strategy: 'whitespace_insensitive' as const,
    };
  }

  const allCompactMatches = offsetAgentAnnotationMatches(
    findWhitespaceAgnosticMatches(matcherContext.whitespaceAgnosticText, exact),
    searchScope.offset,
  );
  stats.whitespaceAgnosticMatchCount += allCompactMatches.length;
  const compactMatches = allowedAgentAnnotationMatches(allCompactMatches, options, matcherContext);
  stats.allowedWhitespaceAgnosticMatchCount += compactMatches.length;
  if (compactMatches.length > 0) {
    return {
      ...selectAgentAnnotationMatch(articleText, compactMatches, exact, suggestion),
      strategy: 'whitespace_agnostic' as const,
    };
  }

  return null;
}

function createAgentAnnotationMatcherContext(
  articleText: string,
  options: CreateAgentAnnotationOptions,
): AgentAnnotationMatcherContext {
  const searchScope = agentAnnotationSearchScope(articleText, options);
  return {
    searchScope,
    whitespaceInsensitiveText: normalizeTextWithMap(searchScope.text),
    whitespaceAgnosticText: normalizeTextWithMap(searchScope.text, false),
    allowedSegmentIds: agentAnnotationAllowedIdSet(options.allowedSegmentIds),
    allowedParagraphIds: agentAnnotationAllowedIdSet(options.allowedParagraphIds),
  };
}

function agentAnnotationSearchScope(
  articleText: string,
  options: CreateAgentAnnotationOptions,
): AgentAnnotationSearchScope {
  const start = Number.isInteger(options.allowedTextStart) ? options.allowedTextStart! : 0;
  const end = Number.isInteger(options.allowedTextEnd)
    ? options.allowedTextEnd!
    : articleText.length;
  const boundedStart = Math.min(Math.max(start, 0), articleText.length);
  const boundedEnd = Math.min(Math.max(end, 0), articleText.length);
  if (boundedStart === 0 && boundedEnd === articleText.length) {
    return { text: articleText, offset: 0 };
  }
  if (boundedEnd <= boundedStart) return { text: '', offset: boundedStart };
  return {
    text: articleText.slice(boundedStart, boundedEnd),
    offset: boundedStart,
  };
}

function offsetAgentAnnotationMatches(
  matches: Array<{ start: number; end: number }>,
  offset: number,
) {
  if (offset === 0) return matches;
  return matches.map((match) => ({
    start: match.start + offset,
    end: match.end + offset,
  }));
}

function logAgentAnnotationMatchTiming(
  articleText: string,
  exact: string,
  options: CreateAgentAnnotationOptions,
  startedAt: number,
  match: { start: number; end: number } | null,
  strategy: AgentAnnotationMatchStrategy | undefined,
  stats: AgentAnnotationMatchStats,
) {
  options.performanceLogger?.('performance.agent_annotation_match', {
    elapsedMs: performanceElapsedMs(startedAt),
    result: match ? 'matched' : 'not_found',
    strategy,
    articleChars: articleText.length,
    exactChars: exact.length,
    allowedTextChars: allowedAgentAnnotationTextChars(options),
    hasEbookIndex: Boolean(options.ebookIndex),
    allowedSegmentCount: options.allowedSegmentIds?.length || 0,
    allowedParagraphCount: options.allowedParagraphIds?.length || 0,
    ...stats,
  });
}

function allowedAgentAnnotationTextChars(options: CreateAgentAnnotationOptions) {
  if (
    Number.isInteger(options.allowedTextStart) &&
    Number.isInteger(options.allowedTextEnd) &&
    options.allowedTextEnd! >= options.allowedTextStart!
  ) {
    return options.allowedTextEnd! - options.allowedTextStart!;
  }
  return undefined;
}

function allowedAgentAnnotationMatches(
  matches: Array<{ start: number; end: number }>,
  options: CreateAgentAnnotationOptions,
  matcherContext: AgentAnnotationMatcherContext,
) {
  return matches.filter((match) => agentAnnotationMatchAllowed(match, options, matcherContext));
}

function agentAnnotationMatchAllowed(
  match: { start: number; end: number },
  options: CreateAgentAnnotationOptions,
  matcherContext: AgentAnnotationMatcherContext,
) {
  if (Number.isInteger(options.allowedTextStart) && match.start < options.allowedTextStart!) {
    return false;
  }
  if (Number.isInteger(options.allowedTextEnd) && match.end > options.allowedTextEnd!) {
    return false;
  }
  if (!options.ebookIndex) return true;
  if (
    !annotationRangesAllowed(options.ebookIndex.segments, match, matcherContext.allowedSegmentIds)
  ) {
    return false;
  }
  return annotationRangesAllowed(
    options.ebookIndex.paragraphs,
    match,
    matcherContext.allowedParagraphIds,
  );
}

function annotationRangesAllowed(
  ranges: Array<{ id: string; textStart: number; textEnd: number }>,
  match: { start: number; end: number },
  allowedIds: Set<string> | undefined,
) {
  if (!allowedIds?.size) return true;
  const overlapping = ranges.filter(
    (range) => match.start < range.textEnd && match.end > range.textStart,
  );
  return overlapping.length > 0 && overlapping.every((range) => allowedIds.has(range.id));
}

function agentAnnotationAllowedIdSet(ids: string[] | undefined) {
  return ids?.length ? new Set(ids) : undefined;
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

function findWhitespaceInsensitiveMatches(
  normalizedText: AgentAnnotationNormalizedText,
  query: string,
) {
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

function findWhitespaceAgnosticMatches(
  normalizedText: AgentAnnotationNormalizedText,
  query: string,
) {
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

export function deleteAnnotationComment(
  annotations: Annotation[],
  annotationId: string,
  commentId: string,
  now = new Date().toISOString(),
) {
  let found = false;
  const nextAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;

    const deletedIds = new Set([commentId]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const comment of annotation.comments) {
        if (!comment.replyTo || !deletedIds.has(comment.replyTo) || deletedIds.has(comment.id)) {
          continue;
        }
        deletedIds.add(comment.id);
        expanded = true;
      }
    }

    const comments = annotation.comments.filter((comment) => !deletedIds.has(comment.id));
    if (comments.length === annotation.comments.length) return annotation;

    found = true;
    return {
      ...annotation,
      comments,
      updatedAt: now,
    };
  });

  return found ? nextAnnotations : null;
}

export function findMentionedAgents(content: string, agents: PublicAgent[]) {
  const byUsername = new Map(
    agents.flatMap((agent) => [[agent.username, agent] as const, [agent.nickname, agent] as const]),
  );
  const mentionedAgents: PublicAgent[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/@([\p{L}\p{N}_-]+)/gu)) {
    const username = match[1];
    const agent = byUsername.get(username);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    mentionedAgents.push(agent);
  }

  return mentionedAgents;
}

export function getMentionQuery(content: string, caretIndex: number): MentionQuery | null {
  const prefix = content.slice(0, caretIndex);
  const match = prefix.match(/(^|\s)@([\p{L}\p{N}_-]*)$/u);
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
    fallback: (user?.nickname || annotation.userNickname || userProfile.nickname || '我').slice(
      0,
      1,
    ),
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
    fallback: (user?.nickname || comment.userNickname || userProfile.nickname || '我').slice(0, 1),
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
    enabled: true,
    personalityName: '自定义个性',
    temperature: 0.35,
  };
}

export function parseAnnotationSuggestions(content: string): AnnotationSuggestion[] {
  const json = content.match(/\[[\s\S]*\]/)?.[0] || content;
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isAnnotationSuggestionInput)
    .map((item) => {
      const suggestion: AnnotationSuggestion = {
        exact: typeof item.exact === 'string' ? item.exact : '',
        prefix: typeof item.prefix === 'string' ? item.prefix : undefined,
        suffix: typeof item.suffix === 'string' ? item.suffix : undefined,
        context: typeof item.context === 'string' ? item.context : undefined,
        comment: typeof item.comment === 'string' ? item.comment : '',
        annotationType: normalizeAnnotationType(item.type),
        readingIntent: normalizeAgentReadingIntent(item.readingIntent),
      };
      const moveType = normalizeAnnotationMove(item.moveType);
      const evidenceUsed = normalizeAnnotationEvidenceUsed(item.evidenceUsed);
      const confidence = normalizeAnnotationConfidence(item.confidence);
      if (moveType) suggestion.moveType = moveType;
      if (typeof item.whyHere === 'string') suggestion.whyHere = item.whyHere;
      if (evidenceUsed) suggestion.evidenceUsed = evidenceUsed;
      if (confidence) suggestion.confidence = confidence;
      if (typeof item.shouldShow === 'boolean') suggestion.shouldShow = item.shouldShow;
      return suggestion;
    })
    .filter((item) => item.exact.trim().length > 0);
}

function isAnnotationSuggestionInput(value: unknown): value is {
  exact?: unknown;
  prefix?: unknown;
  suffix?: unknown;
  context?: unknown;
  comment?: unknown;
  type?: unknown;
  readingIntent?: unknown;
  moveType?: unknown;
  whyHere?: unknown;
  evidenceUsed?: unknown;
  confidence?: unknown;
  shouldShow?: unknown;
} {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function annotationDensityInstruction(density: AgentAnnotationDensity, sourceText = '') {
  const max = annotationDensityMax(density, sourceText);
  if (density === 'low')
    return `克制，本次最多 ${max} 条，只选择能明显改变理解的片段；内容普通时可以返回空数组。`;
  if (density === 'high')
    return `积极，本次最多 ${max} 条，覆盖多个值得讨论的片段；短文仍保持克制。`;
  return `标准，本次最多 ${max} 条，优先保留少量高价值批注；内容普通时可以返回空数组。`;
}

export function annotationDensityMax(density: AgentAnnotationDensity, sourceText = '') {
  const size = annotationSourceSize(sourceText);
  if (size <= 280) return density === 'high' ? 2 : 1;
  if (size <= 800) return density === 'low' ? 1 : density === 'high' ? 3 : 2;
  if (size <= 2000) return density === 'low' ? 2 : density === 'high' ? 5 : 3;
  return density === 'low' ? 3 : density === 'high' ? 8 : 5;
}

function annotationSourceSize(sourceText: string) {
  return sourceText.replace(/\s+/g, '').length;
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

function normalizeAnnotationMove(value: unknown): AnnotationMove | null {
  return value === 'explain_concept' ||
    value === 'surface_assumption' ||
    value === 'ask_question' ||
    value === 'connect_previous' ||
    value === 'challenge_argument' ||
    value === 'reader_application' ||
    value === 'style_observation' ||
    value === 'structure_marker' ||
    value === 'definition_watch' ||
    value === 'foreshadowing_watch'
    ? value
    : null;
}

function normalizeAnnotationEvidenceUsed(value: unknown): AnnotationEvidenceSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value
    .map((item) => normalizeAnnotationEvidenceSource(item))
    .filter((item): item is AnnotationEvidenceSource => Boolean(item));
  return sources.length > 0 ? Array.from(new Set(sources)) : undefined;
}

function normalizeAnnotationEvidenceSource(value: unknown): AnnotationEvidenceSource | null {
  return value === 'localText' ||
    value === 'chapterSummary' ||
    value === 'trace' ||
    value === 'relatedPassage'
    ? value
    : null;
}

function normalizeAnnotationConfidence(value: unknown): AnnotationConfidence | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
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
