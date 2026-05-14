import type {
  AgentReadingPlanItem,
  EpubBookIndex,
  EpubChapterIndex,
  EpubParagraphIndex,
  ReaderProgress,
  SpoilerPolicy,
  TextAnchor,
  TextRange,
} from '@yomitomo/shared';
import { createEpubTextAnchor, locateEpubOffset, locateEpubTextAnchor } from './ebook-index';
import {
  buildReadingContextBundle,
  type ReadingContextPassageInput,
  type ReadingContextTextRange,
} from './reading-context';

const DEFAULT_RELATED_PASSAGE_LIMIT = 4;
const DEFAULT_NEIGHBOR_PARAGRAPHS = 1;
const MIN_RELATED_PASSAGE_SCORE = 0.6;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

export type LexicalRelatedPassageScope = 'current-chapter' | 'read-so-far';

export type BuildCurrentChapterLexicalRelatedPassagesInput = {
  articleText: string;
  ebookIndex: EpubBookIndex;
  query: string | string[];
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  targetAnchor?: TextAnchor;
  readingPlan?: AgentReadingPlanItem[];
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
  scope?: LexicalRelatedPassageScope;
  excludeParagraphIds?: string[];
  maxPassages?: number;
  neighborParagraphs?: number;
};

type ParagraphDocument = {
  paragraph: EpubParagraphIndex;
  text: string;
  ranges: ReadingContextTextRange[];
  terms: Map<string, number>;
  length: number;
};

type ScoredParagraph = ParagraphDocument & {
  score: number;
  matchedTerms: string[];
};

export function buildCurrentChapterLexicalRelatedPassages(
  input: BuildCurrentChapterLexicalRelatedPassagesInput,
): ReadingContextPassageInput[] {
  const queries = queryTexts(input.query);
  const queryTerms = termCounts(queries.flatMap(tokenizeLexicalText));
  if (queryTerms.size === 0) return [];

  const chapter = currentChapter(input);
  if (!chapter) return [];

  const allowedRanges = buildReadingContextBundle({
    articleText: input.articleText,
    ebookIndex: input.ebookIndex,
    targetAnchor: input.targetAnchor,
    readingPlan: input.readingPlan,
    readerProgress: input.readerProgress,
    spoilerPolicy: input.spoilerPolicy,
  }).textRanges;
  if (allowedRanges.length === 0) return [];

  const chapterIds = candidateChapterIds(input, chapter);
  const excluded = new Set(input.excludeParagraphIds || []);
  const documents = input.ebookIndex.paragraphs.flatMap((paragraph) => {
    if (!chapterIds.has(paragraph.chapterId) || excluded.has(paragraph.id)) return [];
    const ranges = intersectTextRanges(allowedRanges, paragraph);
    const text = textForRanges(input.articleText, ranges);
    if (!text) return [];
    const terms = termCounts(tokenizeLexicalText(text));
    return terms.size > 0 ? [{ paragraph, text, ranges, terms, length: tokenLength(terms) }] : [];
  });
  if (documents.length === 0) return [];

  const scored = scoreDocuments(documents, queryTerms, queries).filter(
    (document) => document.score >= MIN_RELATED_PASSAGE_SCORE,
  );
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.paragraph.textStart - right.paragraph.textStart;
  });

  return buildPassages(input, scored, allowedRanges, excluded);
}

function queryTexts(query: string | string[]) {
  return (Array.isArray(query) ? query : [query])
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function currentChapter(
  input: BuildCurrentChapterLexicalRelatedPassagesInput,
): EpubChapterIndex | null {
  if (input.chapterId) {
    return input.ebookIndex.chapters.find((chapter) => chapter.id === input.chapterId) || null;
  }
  if (input.readerProgress?.currentChapterId) {
    return (
      input.ebookIndex.chapters.find(
        (chapter) => chapter.id === input.readerProgress?.currentChapterId,
      ) || null
    );
  }
  if (input.paragraphId) {
    const paragraph = input.ebookIndex.paragraphs.find((item) => item.id === input.paragraphId);
    return paragraph ? chapterById(input.ebookIndex, paragraph.chapterId) : null;
  }
  if (input.segmentId) {
    const segment = input.ebookIndex.segments.find((item) => item.id === input.segmentId);
    return segment ? chapterById(input.ebookIndex, segment.chapterId) : null;
  }
  if (input.targetAnchor?.chapterId) {
    return chapterById(input.ebookIndex, input.targetAnchor.chapterId);
  }
  if (input.targetAnchor) {
    return (
      locateEpubTextAnchor(input.ebookIndex, input.articleText, input.targetAnchor)?.chapter || null
    );
  }
  const firstPlanItem = input.readingPlan?.[0];
  if (firstPlanItem) {
    return locateEpubOffset(input.ebookIndex, firstPlanItem.sectionStart)?.chapter || null;
  }
  return locateEpubOffset(input.ebookIndex, 0)?.chapter || null;
}

function chapterById(index: EpubBookIndex, chapterId: string) {
  return index.chapters.find((chapter) => chapter.id === chapterId) || null;
}

function candidateChapterIds(
  input: BuildCurrentChapterLexicalRelatedPassagesInput,
  chapter: EpubChapterIndex,
) {
  if (input.scope !== 'read-so-far') return new Set([chapter.id]);
  return new Set([...(input.readerProgress?.readChapterIds || []), chapter.id]);
}

function scoreDocuments(
  documents: ParagraphDocument[],
  queryTerms: Map<string, number>,
  queryPhrases: string[],
): ScoredParagraph[] {
  const avgLength =
    documents.reduce((total, document) => total + document.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms.keys()) {
    documentFrequency.set(term, documents.filter((document) => document.terms.has(term)).length);
  }

  return documents.flatMap((document) => {
    let score = 0;
    const matchedTerms: string[] = [];
    for (const [term, queryCount] of queryTerms) {
      const count = document.terms.get(term) || 0;
      if (count === 0) continue;
      matchedTerms.push(term);
      const frequency = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5));
      const normalized =
        (count * (BM25_K1 + 1)) /
        (count + BM25_K1 * (1 - BM25_B + BM25_B * (document.length / avgLength)));
      score += idf * normalized * Math.sqrt(queryCount);
    }

    const phraseBonus = queryPhrases.reduce(
      (total, phrase) => total + phraseMatchBonus(document.text, phrase),
      0,
    );
    const finalScore = score + phraseBonus;
    return finalScore > 0
      ? [
          {
            ...document,
            score: finalScore,
            matchedTerms,
          },
        ]
      : [];
  });
}

function buildPassages(
  input: BuildCurrentChapterLexicalRelatedPassagesInput,
  scored: ScoredParagraph[],
  allowedRanges: ReadingContextTextRange[],
  excluded: Set<string>,
): ReadingContextPassageInput[] {
  const maxPassages = positiveInteger(input.maxPassages, DEFAULT_RELATED_PASSAGE_LIMIT);
  const neighborParagraphs = nonNegativeInteger(
    input.neighborParagraphs,
    DEFAULT_NEIGHBOR_PARAGRAPHS,
  );
  const usedParagraphIds = new Set<string>();
  const passages: ReadingContextPassageInput[] = [];

  for (const document of scored) {
    if (passages.length >= maxPassages || usedParagraphIds.has(document.paragraph.id)) continue;
    const blocks = paragraphWindow(input.ebookIndex, document.paragraph, neighborParagraphs)
      .filter((paragraph) => !excluded.has(paragraph.id))
      .flatMap((paragraph) => {
        const ranges = intersectTextRanges(allowedRanges, paragraph);
        const text = textForRanges(input.articleText, ranges);
        return text ? [{ paragraph, ranges, text }] : [];
      });
    if (blocks.length === 0) continue;

    const passageText = blocks
      .map((block) => block.text)
      .join('\n\n')
      .trim();
    const range = blockRange(blocks);
    const anchorRange = document.ranges[0];
    if (!passageText || !range || !anchorRange) continue;

    for (const block of blocks) usedParagraphIds.add(block.paragraph.id);
    passages.push({
      id: `${input.ebookIndex.articleId}:current-chapter-lexical:${document.paragraph.id}`,
      text: passageText,
      textStart: range.textStart,
      textEnd: range.textEnd,
      chapterId: document.paragraph.chapterId,
      segmentId: document.paragraph.segmentId,
      paragraphId: document.paragraph.id,
      source: 'current-chapter-lexical',
      reason: relatedPassageReason(document.matchedTerms),
      score: roundScore(document.score),
      anchor: createRelatedPassageAnchor(
        input.ebookIndex,
        input.articleText,
        document.paragraph,
        anchorRange,
      ),
    });
  }

  return passages;
}

function createRelatedPassageAnchor(
  index: EpubBookIndex,
  articleText: string,
  paragraph: EpubParagraphIndex,
  range: ReadingContextTextRange,
) {
  const anchor = createEpubTextAnchor(index, articleText, range.textStart, range.textEnd);
  return {
    ...anchor,
    prefix: articleText.slice(Math.max(paragraph.textStart, range.textStart - 40), range.textStart),
    suffix: articleText.slice(range.textEnd, Math.min(paragraph.textEnd, range.textEnd + 40)),
  };
}

function paragraphWindow(
  index: EpubBookIndex,
  paragraph: EpubParagraphIndex,
  neighborParagraphs: number,
) {
  const siblings = index.paragraphs.filter((item) => item.chapterId === paragraph.chapterId);
  const indexInChapter = siblings.findIndex((item) => item.id === paragraph.id);
  if (indexInChapter < 0) return [];
  return siblings.slice(
    Math.max(0, indexInChapter - neighborParagraphs),
    indexInChapter + neighborParagraphs + 1,
  );
}

function intersectTextRanges(
  ranges: ReadingContextTextRange[],
  target: TextRange,
): ReadingContextTextRange[] {
  return ranges.flatMap((range) => {
    const textStart = Math.max(range.textStart, target.textStart);
    const textEnd = Math.min(range.textEnd, target.textEnd);
    return textEnd > textStart ? [{ textStart, textEnd }] : [];
  });
}

function textForRanges(articleText: string, ranges: ReadingContextTextRange[]) {
  return ranges
    .map((range) => articleText.slice(range.textStart, range.textEnd).trim())
    .filter(Boolean)
    .join('\n\n');
}

function blockRange(
  blocks: Array<{ ranges: ReadingContextTextRange[] }>,
): ReadingContextTextRange | null {
  const ranges = blocks.flatMap((block) => block.ranges);
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  return first && last ? { textStart: first.textStart, textEnd: last.textEnd } : null;
}

function relatedPassageReason(terms: string[]) {
  const unique = terms.filter((term, index, list) => list.indexOf(term) === index).slice(0, 5);
  return unique.length > 0 ? `同章 lexical 命中：${unique.join('、')}` : '同章 lexical 命中';
}

function phraseMatchBonus(text: string, phrase: string) {
  const normalizedPhrase = normalizeLexicalText(phrase);
  if (normalizedPhrase.length < 2 || normalizedPhrase.length > 40) return 0;
  return normalizeLexicalText(text).includes(normalizedPhrase) ? 1.2 : 0;
}

function tokenizeLexicalText(text: string) {
  const tokens: string[] = [];
  let ascii = '';
  let cjk = '';
  const flushAscii = () => {
    if (ascii.length >= 2 && !STOP_TERMS.has(ascii)) tokens.push(ascii);
    ascii = '';
  };
  const flushCjk = () => {
    tokens.push(...cjkTokens(cjk));
    cjk = '';
  };

  for (const rawChar of normalizeLexicalText(text)) {
    if (isAsciiWordChar(rawChar)) {
      flushCjk();
      ascii += rawChar;
      continue;
    }
    if (isCjk(rawChar)) {
      flushAscii();
      cjk += rawChar;
      continue;
    }
    flushAscii();
    flushCjk();
  }
  flushAscii();
  flushCjk();
  return tokens;
}

function cjkTokens(text: string) {
  if (text.length < 2) return [];
  const tokens: string[] = [];
  if (text.length <= 8 && !STOP_TERMS.has(text)) tokens.push(text);
  for (const size of [2, 3]) {
    for (let index = 0; index <= text.length - size; index += 1) {
      const token = text.slice(index, index + size);
      if (!STOP_TERMS.has(token)) tokens.push(token);
    }
  }
  return tokens;
}

function termCounts(tokens: string[]) {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function tokenLength(terms: Map<string, number>) {
  return Array.from(terms.values()).reduce((total, count) => total + count, 0);
}

function normalizeLexicalText(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isAsciiWordChar(char: string) {
  return /^[a-z0-9]$/.test(char);
}

function isCjk(char: string) {
  const code = char.codePointAt(0) || 0;
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

function roundScore(score: number) {
  return Number(score.toFixed(4));
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value !== undefined && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value !== undefined && value >= 0
    ? Math.floor(value)
    : fallback;
}

const STOP_TERMS = new Set([
  '一个',
  '这个',
  '那个',
  '这些',
  '那些',
  '我们',
  '他们',
  '你们',
  '它们',
  '可以',
  '因为',
  '所以',
  '但是',
  '如果',
  '不是',
  '就是',
  '以及',
  '或者',
  '关于',
  '什么',
  '哪里',
  '这里',
  '那里',
  '前面',
  '提过',
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
]);
