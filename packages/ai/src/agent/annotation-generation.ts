import type {
  Agent,
  AgentAnnotationDensity,
  AgentReadingIntent,
  Annotation,
  AnnotationConfidence,
  AnnotationEvidenceSource,
  AnnotationMove,
  AnnotationType,
  EpubBookIndex,
  TextAnchor,
} from '@yomitomo/shared';
import {
  createTextAnchor,
  makeId,
  normalizeAgentReadingIntent,
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
  normalizeAnnotationType,
  normalizeTextWithMap,
} from '@yomitomo/shared';
import {
  createEpubTextAnchor,
  performanceElapsedMs,
  performanceStart,
  rangeDistance,
  type PerformanceTimingLogger,
} from '@yomitomo/core';

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

export type CreateAgentAnnotationOptions = {
  ebookIndex?: EpubBookIndex;
  allowedTextStart?: number;
  allowedTextEnd?: number;
  allowedSegmentIds?: string[];
  allowedParagraphIds?: string[];
  performanceLogger?: PerformanceTimingLogger;
};

export type AnnotationSuggestionPath =
  | 'article_json'
  | 'article_ndjson'
  | 'segment_json'
  | 'segment_ndjson';

export type AnnotationSuggestionRejectionReason =
  | 'invalid_suggestion'
  | 'density_limit'
  | 'should_not_show'
  | 'anchor_not_found'
  | 'duplicate';

export type AnnotationSuggestionDedupeMode = 'none' | 'thought' | 'segment';

export type AnnotationSuggestionAcceptance = {
  accept(
    input: unknown,
    options: {
      maxAnnotations: number;
      densityScope?: string;
      annotationType?: AnnotationType;
      readingIntent?: AgentReadingIntent;
      targetAnchor?: Pick<TextAnchor, 'exact' | 'prefix' | 'suffix'>;
      createOptions?: CreateAgentAnnotationOptions;
      now?: string;
      diagnosticContext?: Record<string, unknown>;
    },
  ):
    | { status: 'accepted'; annotation: Annotation; suggestion: AnnotationSuggestion }
    | {
        status: 'rejected';
        reason: AnnotationSuggestionRejectionReason;
        suggestion?: AnnotationSuggestion;
      };
};

export function createAnnotationSuggestionAcceptance(options: {
  agent: Agent;
  articleText: string;
  path: AnnotationSuggestionPath;
  dedupe: AnnotationSuggestionDedupeMode;
  existingAnnotations?: Annotation[];
  logger?: PerformanceTimingLogger;
}): AnnotationSuggestionAcceptance {
  const acceptedByScope = new Map<string, number>();
  const deduper = createAnnotationSuggestionDeduper(
    options.dedupe,
    options.articleText,
    options.existingAnnotations || [],
  );

  return {
    accept(input, acceptanceOptions) {
      const suggestion = normalizeAnnotationSuggestion(input);
      if (!suggestion) {
        logAnnotationSuggestionDecision(
          options.logger,
          options.path,
          options.agent,
          undefined,
          { status: 'rejected', reason: 'invalid_suggestion' },
          acceptanceOptions.diagnosticContext,
        );
        return { status: 'rejected', reason: 'invalid_suggestion' };
      }

      const resolvedSuggestion = resolveAnnotationSuggestionMetadata(suggestion, acceptanceOptions);
      const densityScope = acceptanceOptions.densityScope || 'default';
      if ((acceptedByScope.get(densityScope) || 0) >= acceptanceOptions.maxAnnotations) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'density_limit',
          acceptanceOptions.diagnosticContext,
        );
      }
      if (resolvedSuggestion.shouldShow === false) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'should_not_show',
          acceptanceOptions.diagnosticContext,
        );
      }

      const annotation = createAgentAnnotation(
        options.agent,
        options.articleText,
        resolvedSuggestion,
        acceptanceOptions.now,
        acceptanceOptions.createOptions,
      );
      if (!annotation) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'anchor_not_found',
          acceptanceOptions.diagnosticContext,
        );
      }
      if (!deduper.accept(annotation)) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'duplicate',
          acceptanceOptions.diagnosticContext,
        );
      }

      acceptedByScope.set(densityScope, (acceptedByScope.get(densityScope) || 0) + 1);
      logAnnotationSuggestionDecision(
        options.logger,
        options.path,
        options.agent,
        resolvedSuggestion,
        { status: 'accepted' },
        acceptanceOptions.diagnosticContext,
      );
      return { status: 'accepted', annotation, suggestion: resolvedSuggestion };
    },
  };
}

function rejectAnnotationSuggestion(
  options: {
    agent: Agent;
    path: AnnotationSuggestionPath;
    logger?: PerformanceTimingLogger;
  },
  suggestion: AnnotationSuggestion,
  reason: AnnotationSuggestionRejectionReason,
  diagnosticContext?: Record<string, unknown>,
) {
  logAnnotationSuggestionDecision(
    options.logger,
    options.path,
    options.agent,
    suggestion,
    { status: 'rejected', reason },
    diagnosticContext,
  );
  return { status: 'rejected' as const, reason, suggestion };
}

function resolveAnnotationSuggestionMetadata(
  suggestion: AnnotationSuggestion,
  options: {
    annotationType?: AnnotationType;
    readingIntent?: AgentReadingIntent;
    targetAnchor?: Pick<TextAnchor, 'exact' | 'prefix' | 'suffix'>;
  },
) {
  return {
    ...suggestion,
    ...options.targetAnchor,
    annotationType: options.annotationType || suggestion.annotationType,
    readingIntent: options.readingIntent || suggestion.readingIntent,
  };
}

function logAnnotationSuggestionDecision(
  logger: PerformanceTimingLogger | undefined,
  path: AnnotationSuggestionPath,
  agent: Agent,
  suggestion: AnnotationSuggestion | undefined,
  decision:
    | { status: 'accepted' }
    | { status: 'rejected'; reason: AnnotationSuggestionRejectionReason },
  context: Record<string, unknown> = {},
) {
  logger?.('agent.annotation_suggestion.decision', {
    path,
    agent: agent.username,
    status: decision.status,
    reason: decision.status === 'rejected' ? decision.reason : undefined,
    exactPreview: suggestion?.exact.slice(0, 120),
    annotationType: suggestion?.annotationType,
    readingIntent: suggestion?.readingIntent,
    moveType: suggestion?.moveType,
    evidenceUsed: suggestion?.evidenceUsed,
    confidence: suggestion?.confidence,
    shouldShow: suggestion?.shouldShow,
    ...context,
  });
}

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
    whitespaceAgnosticText: normalizeTextWithMap(searchScope.text, 'remove'),
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

export function parseAnnotationSuggestions(content: string): AnnotationSuggestion[] {
  return parseAnnotationSuggestionInputs(content)
    .map(normalizeAnnotationSuggestion)
    .filter((item): item is AnnotationSuggestion => item !== null);
}

export function parseAnnotationSuggestionInputs(content: string): unknown[] {
  const json = content.match(/\[[\s\S]*\]/)?.[0] || content;
  const parsed: unknown = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [];
}

export function normalizeAnnotationSuggestion(input: unknown): AnnotationSuggestion | null {
  if (!isAnnotationSuggestionInput(input)) return null;
  const exact = typeof input.exact === 'string' ? input.exact : '';
  if (!exact.trim()) return null;

  const suggestion: AnnotationSuggestion = {
    exact,
    prefix: typeof input.prefix === 'string' ? input.prefix : undefined,
    suffix: typeof input.suffix === 'string' ? input.suffix : undefined,
    context: typeof input.context === 'string' ? input.context : undefined,
    comment: typeof input.comment === 'string' ? input.comment : '',
    annotationType: normalizeAnnotationType(input.type),
    readingIntent: normalizeAgentReadingIntent(input.readingIntent),
  };
  const moveType = normalizeAnnotationMove(input.moveType);
  const evidenceUsed = normalizeAnnotationEvidenceUsed(input.evidenceUsed);
  const confidence = normalizeAnnotationConfidence(input.confidence);
  if (moveType) suggestion.moveType = moveType;
  if (typeof input.whyHere === 'string') suggestion.whyHere = input.whyHere;
  if (evidenceUsed) suggestion.evidenceUsed = evidenceUsed;
  if (confidence) suggestion.confidence = confidence;
  if (typeof input.shouldShow === 'boolean') suggestion.shouldShow = input.shouldShow;
  return suggestion;
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

function createAnnotationSuggestionDeduper(
  mode: AnnotationSuggestionDedupeMode,
  articleText: string,
  existingAnnotations: Annotation[],
) {
  if (mode === 'none') return { accept: () => true };
  if (mode === 'thought') return createThoughtAnnotationDeduper(articleText, existingAnnotations);
  return createSegmentAnnotationDeduper(articleText, existingAnnotations);
}

function createThoughtAnnotationDeduper(articleText: string, existingAnnotations: Annotation[]) {
  const accepted = existingAnnotations.flatMap((annotation) => {
    const item = thoughtAnnotationDedupItem(articleText, annotation);
    return item ? [item] : [];
  });

  return {
    accept(annotation: Annotation) {
      const item = thoughtAnnotationDedupItem(articleText, annotation);
      if (!item) return true;
      if (accepted.some((existing) => thoughtAnnotationDedupItemsMatch(existing, item))) {
        return false;
      }
      accepted.push(item);
      return true;
    },
  };
}

type ThoughtAnnotationDedupItem = {
  exactKey: string;
  textStart: number;
  textEnd: number;
  comments: string[];
};

function thoughtAnnotationDedupItem(
  articleText: string,
  annotation: Annotation,
): ThoughtAnnotationDedupItem | null {
  const textStart =
    integerAnnotationValue(annotation.anchor.textStartInBook) ??
    integerAnnotationValue(annotation.anchor.start);
  const textEnd =
    integerAnnotationValue(annotation.anchor.textEndInBook) ??
    integerAnnotationValue(annotation.anchor.end);
  if (textStart === null || textEnd === null || textEnd <= textStart) return null;

  const comments = annotation.comments
    .map((comment) => normalizeThoughtText(comment.content))
    .filter((comment) => comment.length >= 12);
  return {
    exactKey: normalizeThoughtText(
      annotation.anchor.exact || articleText.slice(textStart, textEnd),
    ),
    textStart,
    textEnd,
    comments,
  };
}

function thoughtAnnotationDedupItemsMatch(
  left: ThoughtAnnotationDedupItem,
  right: ThoughtAnnotationDedupItem,
) {
  if (!sameThoughtAnnotationAnchor(left, right)) return false;
  if (left.comments.length === 0 || right.comments.length === 0) {
    return left.exactKey === right.exactKey;
  }
  return left.comments.some((leftComment) =>
    right.comments.some((rightComment) => thoughtTextsSimilar(leftComment, rightComment)),
  );
}

function sameThoughtAnnotationAnchor(
  left: Pick<ThoughtAnnotationDedupItem, 'exactKey' | 'textStart' | 'textEnd'>,
  right: Pick<ThoughtAnnotationDedupItem, 'exactKey' | 'textStart' | 'textEnd'>,
) {
  if (left.exactKey && left.exactKey === right.exactKey) return true;
  return rangeDistance(left, right) <= 16;
}

function thoughtTextsSimilar(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  if (shorter.length >= 24 && longer.includes(shorter)) return true;
  return diceCoefficient(characterBigrams(left), characterBigrams(right)) >= 0.58;
}

function characterBigrams(text: string) {
  if (text.length <= 1) return new Set(text ? [text] : []);
  const grams = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return (2 * overlap) / (left.size + right.size);
}

function normalizeThoughtText(text: string) {
  return text.replace(/[\s"'“”‘’`，。！？、；：,.!?;:—\-（）()[\]{}]/g, '').toLowerCase();
}

function createSegmentAnnotationDeduper(articleText: string, existingAnnotations: Annotation[]) {
  const accepted = existingAnnotations.flatMap((annotation) => {
    const item = segmentAnnotationDedupItem(articleText, annotation);
    return item ? [item] : [];
  });

  return {
    accept(annotation: Annotation) {
      const item = segmentAnnotationDedupItem(articleText, annotation);
      if (!item) return true;
      if (accepted.some((existing) => segmentAnnotationDedupItemsMatch(existing, item))) {
        return false;
      }
      accepted.push(item);
      return true;
    },
  };
}

type SegmentAnnotationDedupItem = {
  exactKey: string;
  textStart: number;
  textEnd: number;
  chapterId?: string;
  segmentId?: string;
  moveType?: string;
};

function segmentAnnotationDedupItem(
  articleText: string,
  annotation: Annotation,
): SegmentAnnotationDedupItem | null {
  const textStart =
    integerAnnotationValue(annotation.anchor.textStartInBook) ??
    integerAnnotationValue(annotation.anchor.start);
  const textEnd =
    integerAnnotationValue(annotation.anchor.textEndInBook) ??
    integerAnnotationValue(annotation.anchor.end);
  if (textStart === null || textEnd === null || textEnd <= textStart) return null;
  return {
    exactKey: normalizeSegmentDedupText(
      annotation.anchor.exact || articleText.slice(textStart, textEnd),
    ),
    textStart,
    textEnd,
    chapterId: annotation.anchor.chapterId,
    segmentId: annotation.anchor.segmentId,
    moveType: annotation.moveType,
  };
}

function segmentAnnotationDedupItemsMatch(
  left: SegmentAnnotationDedupItem,
  right: SegmentAnnotationDedupItem,
) {
  const sameSegment = left.segmentId && right.segmentId && left.segmentId === right.segmentId;
  const sameChapter = left.chapterId && right.chapterId && left.chapterId === right.chapterId;
  const distance = rangeDistance(left, right);
  if (
    left.exactKey &&
    left.exactKey === right.exactKey &&
    (sameSegment || sameChapter || distance <= 2400)
  ) {
    return true;
  }
  if (left.moveType && right.moveType && left.moveType === right.moveType) {
    return Boolean(sameSegment) || distance <= 240;
  }
  return false;
}

function normalizeSegmentDedupText(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function integerAnnotationValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
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

function normalizeAnnotationEvidenceUsed(value: unknown): AnnotationEvidenceSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value
    .map((item) => normalizeAnnotationEvidenceSource(item))
    .filter((item): item is AnnotationEvidenceSource => Boolean(item));
  return sources.length > 0 ? Array.from(new Set(sources)) : undefined;
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
