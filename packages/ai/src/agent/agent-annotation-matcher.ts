import { normalizeTextWithMap } from '@yomitomo/shared';
import { performanceElapsedMs, performanceStart } from '@yomitomo/core';
import type {
  AnnotationSuggestion,
  CreateAgentAnnotationOptions,
} from './annotation-generation-types';

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
export function findAgentAnnotationMatch(
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
