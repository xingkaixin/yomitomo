import type { ArticleTextSection, ArticleTextSnapshot } from '@yomitomo/shared';
import {
  lexicalDocument,
  rankLexicalDocuments,
  type LexicalDocument,
} from '../reader/lexical-related-passages';
import {
  createMergedReadingContextRangeLookup,
  mergeReadingContextTextRanges,
  type ReadingContextTextRange,
} from '../reader/reading-context-ranges';

const SOFT_BLOCK_CHARS = 600;
const MAX_BLOCK_CHARS = 1200;
const DEFAULT_READ_CHARS = 6000;
const SENTENCE_END = /[。！？!?.…;；"”’」』)）]$/;

export type ArticleTextBlock = {
  id: string;
  start: number;
  end: number;
  text: string;
};

export type ArticleTextOutlineItem = ArticleTextSection & {
  firstBlockId: string;
  blockCount: number;
};

export type ArticleTextRead = {
  blocks: ArticleTextBlock[];
  nextBlockId?: string;
};

export type ArticleTextSearchHit = {
  block: ArticleTextBlock;
  section?: ArticleTextSection;
  score: number;
};

export type ArticleTextIndex = ReturnType<typeof createArticleTextIndex>;

// Blocks outside visibleRanges are dropped and partially visible blocks are clipped, so
// every reader of the index sees only what the spoiler scope allows.
export function createArticleTextIndex(
  snapshot: ArticleTextSnapshot,
  visibleRanges?: ReadingContextTextRange[],
) {
  const blocks = visibleBlocks(snapshot.text, visibleRanges);
  const positions = new Map(blocks.map((block, index) => [block.id, index]));
  let lexicalDocuments: Array<LexicalDocument & { block: ArticleTextBlock }> | undefined;

  function sectionFor(offset: number) {
    let match: ArticleTextSection | undefined;
    for (const section of snapshot.sections) {
      if (offset < section.start || offset >= section.end) continue;
      if (!match || (section.depth ?? 0) >= (match.depth ?? 0)) match = section;
    }
    return match;
  }

  function blocksIn(section: ArticleTextSection) {
    return blocks.filter((block) => block.start >= section.start && block.start < section.end);
  }

  function readFrom(index: number, limit: (block: ArticleTextBlock) => boolean, maxChars: number) {
    const result: ArticleTextBlock[] = [];
    let chars = 0;
    for (let cursor = index; cursor < blocks.length; cursor++) {
      const block = blocks[cursor]!;
      if (!limit(block)) return { blocks: result };
      if (result.length > 0 && chars + block.text.length > maxChars) {
        return { blocks: result, nextBlockId: block.id };
      }
      result.push(block);
      chars += block.text.length;
    }
    return { blocks: result };
  }

  return {
    textLength: snapshot.text.length,
    outline(): ArticleTextOutlineItem[] {
      return snapshot.sections.flatMap((section) => {
        const sectionBlocks = blocksIn(section);
        const first = sectionBlocks[0];
        return first
          ? [{ ...section, firstBlockId: first.id, blockCount: sectionBlocks.length }]
          : [];
      });
    },
    section(id: string) {
      return snapshot.sections.find((section) => section.id === id);
    },
    sectionFor,
    blockAt(offset: number) {
      return blocks.find((block) => block.end > offset);
    },
    readSection(sectionId: string, fromBlockId?: string, maxChars = DEFAULT_READ_CHARS) {
      const section = snapshot.sections.find((item) => item.id === sectionId);
      if (!section) return null;
      const first = fromBlockId ? positions.get(fromBlockId) : undefined;
      const start = first ?? blocks.findIndex((block) => block.start >= section.start);
      if (start < 0) return { blocks: [] };
      return readFrom(start, (block) => block.start < section.end, maxChars);
    },
    readBlocks(fromBlockId: string, maxChars = DEFAULT_READ_CHARS): ArticleTextRead | null {
      const start = positions.get(fromBlockId);
      return start === undefined ? null : readFrom(start, () => true, maxChars);
    },
    around(offset: number, maxChars = DEFAULT_READ_CHARS / 2): ArticleTextRead {
      const center = blocks.findIndex((block) => block.end > offset);
      if (center < 0) return { blocks: [] };
      let first = center;
      let last = center;
      let chars = blocks[center]!.text.length;
      while (chars < maxChars && (first > 0 || last < blocks.length - 1)) {
        const before = blocks[first - 1];
        const after = blocks[last + 1];
        const next = !after || (before && center - first <= last - center) ? before : after;
        if (!next || chars + next.text.length > maxChars) break;
        chars += next.text.length;
        if (next === before) first -= 1;
        else last += 1;
      }
      return { blocks: blocks.slice(first, last + 1) };
    },
    search(query: string, limit: number): ArticleTextSearchHit[] {
      lexicalDocuments ??= blocks.flatMap((block) => {
        const document = lexicalDocument(block.text);
        return document ? [{ ...document, block }] : [];
      });
      return rankLexicalDocuments(lexicalDocuments, query)
        .slice(0, limit)
        .map((document) => ({
          block: document.block,
          section: sectionFor(document.block.start),
          score: Number(document.score.toFixed(3)),
        }));
    },
  };
}

function visibleBlocks(text: string, visibleRanges: ReadingContextTextRange[] | undefined) {
  const blocks = splitArticleTextBlocks(text);
  if (!visibleRanges) return blocks;
  const lookup = createMergedReadingContextRangeLookup(
    mergeReadingContextTextRanges(visibleRanges),
  );
  return blocks.flatMap((block) => {
    const ranges = lookup.intersections({ textStart: block.start, textEnd: block.end });
    const first = ranges[0];
    const last = ranges.at(-1);
    if (!first || !last) return [];
    if (first.textStart === block.start && last.textEnd === block.end) return [block];
    const clipped = trimmedBlock(text, block.id, first.textStart, last.textEnd);
    return clipped ? [clipped] : [];
  });
}

// Lines that end mid-sentence are joined so PDF line wraps form paragraphs, while long
// unbroken text (Web textContent without newlines) is cut near sentence ends.
export function splitArticleTextBlocks(text: string): ArticleTextBlock[] {
  const spans: Array<[number, number]> = [];
  let blockStart = -1;
  let blockEnd = -1;
  const flush = () => {
    if (blockStart >= 0) spans.push(...splitLongSpan(text, blockStart, blockEnd));
    blockStart = -1;
  };

  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd).trim();
    if (!line) {
      flush();
    } else {
      if (blockStart < 0) blockStart = lineStart;
      blockEnd = lineEnd;
      if (SENTENCE_END.test(line) || blockEnd - blockStart >= SOFT_BLOCK_CHARS) flush();
    }
    if (newline < 0) break;
    lineStart = newline + 1;
  }
  flush();

  return spans.flatMap(
    ([start, end], index) => trimmedBlock(text, `b${index + 1}`, start, end) ?? [],
  );
}

function splitLongSpan(text: string, start: number, end: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let cursor = start;
  while (end - cursor > MAX_BLOCK_CHARS) {
    const window = text.slice(cursor + SOFT_BLOCK_CHARS, cursor + MAX_BLOCK_CHARS);
    const match = /[。！？!?.…](?=\s|[^.\d]|$)/g;
    let cut = -1;
    for (let found = match.exec(window); found; found = match.exec(window)) {
      cut = found.index + 1;
    }
    const next = cut >= 0 ? cursor + SOFT_BLOCK_CHARS + cut : cursor + MAX_BLOCK_CHARS;
    spans.push([cursor, next]);
    cursor = next;
  }
  spans.push([cursor, end]);
  return spans;
}

function trimmedBlock(text: string, id: string, start: number, end: number) {
  const raw = text.slice(start, end);
  const leading = raw.length - raw.trimStart().length;
  const content = raw.trim();
  if (!content) return null;
  return { id, start: start + leading, end: start + leading + content.length, text: content };
}
