import type {
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSourceType,
  ArticleSummaryRecord,
  EbookChapterRecord,
  EbookFormat,
  EbookMetadata,
  EpubBookIndex,
  EpubChapterIndex,
  EpubParagraphIndex,
  EpubSegmentIndex,
  FocusCoReadingPlan,
  PdfMetadata,
  TextSourceFormat,
  TextSourceMetadata,
} from '@yomitomo/shared';
import { normalizeArticleSourceType } from '@yomitomo/shared';
import { articleCounts } from '@yomitomo/core';
export { normalizeArticleSourceType } from '@yomitomo/shared';
import { normalizeAnnotationDensity } from './store-normalizers-provider-agent';
import * as schema from '../db/schema';
import {
  normalizeNonNegativeInteger,
  recordValue,
  stringArray,
  stringValue,
} from './store-normalizers-common';

type ArticleRow = typeof schema.articles.$inferSelect;
export type ArticleSummaryRow = Pick<
  ArticleRow,
  | 'id'
  | 'url'
  | 'canonicalUrl'
  | 'sourceType'
  | 'title'
  | 'byline'
  | 'excerpt'
  | 'siteName'
  | 'themeColor'
  | 'contentHash'
  | 'ebookMetadata'
  | 'pdfMetadata'
  | 'textMetadata'
  | 'readingProgress'
  | 'createdAt'
  | 'updatedAt'
>;

type ArticleRecordWithoutSource = Omit<ArticleRecord, 'sourceType' | 'ebook' | 'pdf' | 'text'>;
type ArticleSummaryRecordWithoutSource = Omit<
  ArticleSummaryRecord,
  'sourceType' | 'ebook' | 'pdf' | 'text'
>;

type FileArticleSourceType = Exclude<ArticleSourceType, 'web'>;

export class ArticleSourcePayloadError extends Error {
  readonly articleId: string;
  readonly code = 'ARTICLE_SOURCE_PAYLOAD_INVALID';
  readonly sourceType: FileArticleSourceType;

  constructor(articleId: string, sourceType: FileArticleSourceType) {
    super(`Article ${articleId} has no valid ${sourceType} source payload`);
    this.name = 'ArticleSourcePayloadError';
    this.articleId = articleId;
    this.sourceType = sourceType;
  }
}

export function normalizeArticleRecord(article: ArticleRecord): ArticleRecord {
  const { sourceType, ebook, pdf, text, ...base } = article;
  const normalizedSourceType = normalizeArticleSourceType(sourceType);
  const normalizedBase: ArticleRecordWithoutSource = {
    ...base,
    readingProgress: normalizeArticleReadingProgress(base.readingProgress, normalizedSourceType),
  };

  switch (normalizedSourceType) {
    case 'web':
      return { ...normalizedBase, sourceType: 'web' };
    case 'ebook': {
      const normalizedEbook = normalizeEbookRecord(ebook);
      if (!normalizedEbook) throw new ArticleSourcePayloadError(article.id, 'ebook');
      return { ...normalizedBase, sourceType: 'ebook', ebook: normalizedEbook };
    }
    case 'pdf': {
      const normalizedPdf = normalizePdfRecord(pdf);
      if (!normalizedPdf) throw new ArticleSourcePayloadError(article.id, 'pdf');
      return { ...normalizedBase, sourceType: 'pdf', pdf: normalizedPdf };
    }
    case 'text': {
      const normalizedText = normalizeTextMetadata(text);
      if (!normalizedText) throw new ArticleSourcePayloadError(article.id, 'text');
      return { ...normalizedBase, sourceType: 'text', text: normalizedText };
    }
  }
}

export function normalizeArticleSummaryRecord(article: ArticleSummaryRecord): ArticleSummaryRecord {
  const {
    sourceType,
    ebook,
    pdf,
    text,
    annotations: _annotations,
    ...base
  } = article as ArticleSummaryRecord & { annotations?: unknown };
  const normalizedSourceType = normalizeArticleSourceType(sourceType);
  const normalizedBase: ArticleSummaryRecordWithoutSource = {
    ...base,
    counts: articleCounts(article),
    readingProgress: normalizeArticleReadingProgress(base.readingProgress, normalizedSourceType),
  };

  switch (normalizedSourceType) {
    case 'web':
      return { ...normalizedBase, sourceType: 'web' };
    case 'ebook': {
      const normalizedEbook = normalizeEbookSummaryRecord(ebook) || emptyEbookSummaryRecord();
      return { ...normalizedBase, sourceType: 'ebook', ebook: normalizedEbook };
    }
    case 'pdf': {
      const normalizedPdf = normalizePdfRecord(pdf) || emptyPdfRecord();
      return { ...normalizedBase, sourceType: 'pdf', pdf: normalizedPdf };
    }
    case 'text': {
      const normalizedText = normalizeTextMetadata(text) || emptyTextMetadata();
      return { ...normalizedBase, sourceType: 'text', text: normalizedText };
    }
  }
}

export function rowToEbook(row: ArticleRow): ArticleRecord['ebook'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'ebook') return undefined;

  const metadata = normalizeEbookMetadata(row.ebookMetadata);
  const chapters = normalizeEbookChapters(row.ebookChapters);
  const index = normalizeEpubBookIndex(row.ebookIndex);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

export function rowToEbookSummary(row: ArticleSummaryRow): ArticleSummaryRecord['ebook'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'ebook') return undefined;

  const metadata = normalizeEbookMetadata(row.ebookMetadata);
  return metadata ? { metadata } : emptyEbookSummaryRecord();
}

export function rowToText(row: ArticleRow): ArticleRecord['text'] {
  return normalizeArticleSourceType(row.sourceType) === 'text'
    ? normalizeTextMetadata(row.textMetadata)
    : undefined;
}

export function rowToTextSummary(row: ArticleSummaryRow): ArticleSummaryRecord['text'] {
  if (normalizeArticleSourceType(row.sourceType) !== 'text') return undefined;
  return normalizeTextMetadata(row.textMetadata) || emptyTextMetadata();
}

function normalizeTextMetadata(value: unknown): TextSourceMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return { format: normalizeTextFormat(recordValue(value).format) };
}

function normalizeTextFormat(value: unknown): TextSourceFormat {
  return value === 'markdown' ? 'markdown' : 'plain';
}

export function normalizeArticleReadingProgress(
  value: unknown,
  sourceType?: ArticleSourceType,
): ArticleReadingProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const progress = recordValue(value);
  const updatedAt = stringValue(progress.updatedAt) || new Date().toISOString();

  switch (progress.kind) {
    case 'scroll':
      return {
        kind: 'scroll',
        progress: normalizeReadingProgressRatio(progress.progress),
        updatedAt,
      };
    case 'page':
      return {
        kind: 'page',
        pageIndex: normalizeReadingProgressIndex(progress.pageIndex),
        pageCount: normalizeReadingProgressCount(progress.pageCount),
        updatedAt,
      };
    case 'chapter':
      return {
        kind: 'chapter',
        chapterIndex: normalizeReadingProgressIndex(progress.chapterIndex),
        chapterProgress: normalizeReadingProgressRatio(progress.chapterProgress),
        bookProgress: normalizeReadingProgressRatio(progress.bookProgress ?? progress.progress),
        updatedAt,
      };
  }

  const pageIndex = Number(progress.pageIndex);
  const pageCount = Number(progress.pageCount);
  const chapterIndex = Number(progress.chapterIndex);
  const chapterProgress = Number(progress.chapterProgress);
  const progressValue = Number(progress.progress);
  const hasChapterAnchor =
    Number.isInteger(chapterIndex) && chapterIndex >= 0 && Number.isFinite(chapterProgress);

  if (sourceType === 'ebook' && hasChapterAnchor) {
    return {
      kind: 'chapter',
      chapterIndex,
      chapterProgress: normalizeReadingProgressRatio(chapterProgress),
      bookProgress: normalizeReadingProgressRatio(progressValue),
      updatedAt,
    };
  }
  if (sourceType === 'ebook') {
    return {
      kind: 'scroll',
      progress: normalizeReadingProgressRatio(progressValue),
      updatedAt,
    };
  }
  if (sourceType === 'pdf') {
    return {
      kind: 'page',
      pageIndex: normalizeReadingProgressIndex(pageIndex),
      pageCount: normalizeReadingProgressCount(pageCount),
      updatedAt,
    };
  }
  if (sourceType === 'web' || sourceType === 'text') {
    return {
      kind: 'scroll',
      progress: normalizeReadingProgressRatio(progressValue),
      updatedAt,
    };
  }
  if (hasChapterAnchor) {
    return {
      kind: 'chapter',
      chapterIndex,
      chapterProgress: normalizeReadingProgressRatio(chapterProgress),
      bookProgress: normalizeReadingProgressRatio(progressValue),
      updatedAt,
    };
  }
  if (pageCount === 1000 && Number.isFinite(progressValue)) {
    return {
      kind: 'scroll',
      progress: normalizeReadingProgressRatio(progressValue),
      updatedAt,
    };
  }
  if (Number.isInteger(pageCount) && pageCount > 0) {
    return {
      kind: 'page',
      pageIndex: normalizeReadingProgressIndex(pageIndex),
      pageCount,
      updatedAt,
    };
  }
  return {
    kind: 'scroll',
    progress: normalizeReadingProgressRatio(progressValue),
    updatedAt,
  };
}

function normalizeReadingProgressIndex(value: unknown) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function normalizeReadingProgressCount(value: unknown) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

function normalizeReadingProgressRatio(value: unknown) {
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

export function normalizeEbookRecord(
  value: ArticleRecord['ebook'] | ArticleSummaryRecord['ebook'] | undefined,
): ArticleRecord['ebook'] {
  const metadata = normalizeEbookMetadata(value?.metadata);
  const chapters = normalizeEbookChapters(
    value && 'chapters' in value ? value.chapters : undefined,
  );
  const index = normalizeEpubBookIndex(value && 'index' in value ? value.index : undefined);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

export function normalizeEbookSummaryRecord(
  value: ArticleRecord['ebook'] | ArticleSummaryRecord['ebook'] | undefined,
): ArticleSummaryRecord['ebook'] {
  const metadata = normalizeEbookMetadata(value?.metadata);
  return metadata ? { metadata } : undefined;
}

export function rowToPdf(row: ArticleRow): ArticleRecord['pdf'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'pdf') return undefined;

  const metadata = normalizePdfMetadata(row.pdfMetadata);
  return metadata ? { metadata } : undefined;
}

export function rowToPdfSummary(row: ArticleSummaryRow): ArticleRecord['pdf'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'pdf') return undefined;

  const metadata = normalizePdfMetadata(row.pdfMetadata);
  return metadata ? { metadata } : emptyPdfRecord();
}

export function normalizePdfRecord(value: ArticleRecord['pdf'] | undefined): ArticleRecord['pdf'] {
  const metadata = normalizePdfMetadata(value?.metadata);
  return metadata ? { metadata } : undefined;
}

function normalizePdfMetadata(value: unknown): PdfMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = recordValue(value);
  const fileName = stringValue(metadata.fileName);
  const fileSize = Number(metadata.fileSize);
  const pageCount = Number(metadata.pageCount);
  return {
    format: 'pdf',
    fileName,
    fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0,
    pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 1,
    title: stringValue(metadata.title) || undefined,
    author: stringValue(metadata.author) || undefined,
    subject: stringValue(metadata.subject) || undefined,
    keywords: stringValue(metadata.keywords) || undefined,
    creator: stringValue(metadata.creator) || undefined,
    producer: stringValue(metadata.producer) || undefined,
    creationDate: stringValue(metadata.creationDate) || undefined,
    modificationDate: stringValue(metadata.modificationDate) || undefined,
  };
}

function emptyEbookSummaryRecord(): NonNullable<ArticleSummaryRecord['ebook']> {
  return { metadata: { format: 'epub', fileName: '', fileSize: 0 } };
}

function emptyPdfRecord(): NonNullable<ArticleRecord['pdf']> {
  return {
    metadata: { format: 'pdf', fileName: '', fileSize: 0, pageCount: 1 },
  };
}

function emptyTextMetadata(): TextSourceMetadata {
  return { format: 'plain' };
}

function normalizeEbookMetadata(value: unknown): EbookMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = recordValue(value);
  const fileName = stringValue(metadata.fileName);
  const fileSize = Number(metadata.fileSize);
  return {
    format: normalizeEbookFormat(metadata.format),
    fileName,
    fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0,
    originalTitle: stringValue(metadata.originalTitle) || undefined,
    displayTitle: stringValue(metadata.displayTitle) || undefined,
    titleCleanupVersion: metadata.titleCleanupVersion === 1 ? 1 : undefined,
    language: stringValue(metadata.language) || undefined,
    publisher: stringValue(metadata.publisher) || undefined,
    description: stringValue(metadata.description) || undefined,
  };
}

function normalizeEbookFormat(value: unknown): EbookFormat {
  return value === 'azw3' || value === 'mobi' ? value : 'epub';
}

function normalizeEbookChapters(value: unknown): EbookChapterRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const chapter = recordValue(item);
    const html = stringValue(chapter.html);
    const title = stringValue(chapter.title);
    if (!html || !title) return [];
    const textLength = Number(chapter.textLength);
    return [
      {
        id: stringValue(chapter.id) || `chapter-${index + 1}`,
        title,
        href: stringValue(chapter.href) || undefined,
        html,
        textLength: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
      },
    ];
  });
}

function normalizeEpubBookIndex(value: unknown): EpubBookIndex | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const index = recordValue(value);
  const chapters = normalizeEpubChapterIndexes(index.chapters);
  const segments = normalizeEpubSegmentIndexes(index.segments);
  const paragraphs = normalizeEpubParagraphIndexes(index.paragraphs);
  const textLength = Number(index.textLength);
  if (chapters.length === 0 || segments.length === 0 || paragraphs.length === 0) return undefined;
  return {
    version: 1,
    articleId: stringValue(index.articleId),
    textLength: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
    chapters,
    segments,
    paragraphs,
  };
}

function normalizeEpubChapterIndexes(value: unknown): EpubChapterIndex[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const chapter = recordValue(item);
    const id = stringValue(chapter.id);
    if (!id) return [];
    return [
      {
        id,
        title: stringValue(chapter.title),
        href: stringValue(chapter.href) || undefined,
        indexInBook: normalizeNonNegativeInteger(chapter.indexInBook),
        textStart: normalizeNonNegativeInteger(chapter.textStart),
        textEnd: normalizeNonNegativeInteger(chapter.textEnd),
        textLength: normalizeNonNegativeInteger(chapter.textLength),
        previewStart: stringValue(chapter.previewStart),
        previewEnd: stringValue(chapter.previewEnd),
        segmentIds: stringArray(chapter.segmentIds),
        paragraphIds: stringArray(chapter.paragraphIds),
      },
    ];
  });
}

function normalizeEpubSegmentIndexes(value: unknown): EpubSegmentIndex[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const segment = recordValue(item);
    const id = stringValue(segment.id);
    const chapterId = stringValue(segment.chapterId);
    if (!id || !chapterId) return [];
    return [
      {
        id,
        chapterId,
        indexInChapter: normalizeNonNegativeInteger(segment.indexInChapter),
        textStart: normalizeNonNegativeInteger(segment.textStart),
        textEnd: normalizeNonNegativeInteger(segment.textEnd),
        textLength: normalizeNonNegativeInteger(segment.textLength),
        previewStart: stringValue(segment.previewStart),
        previewEnd: stringValue(segment.previewEnd),
        paragraphIds: stringArray(segment.paragraphIds),
      },
    ];
  });
}

function normalizeEpubParagraphIndexes(value: unknown): EpubParagraphIndex[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const paragraph = recordValue(item);
    const id = stringValue(paragraph.id);
    const chapterId = stringValue(paragraph.chapterId);
    const segmentId = stringValue(paragraph.segmentId);
    if (!id || !chapterId || !segmentId) return [];
    return [
      {
        id,
        chapterId,
        segmentId,
        indexInChapter: normalizeNonNegativeInteger(paragraph.indexInChapter),
        indexInSegment: normalizeNonNegativeInteger(paragraph.indexInSegment),
        textStart: normalizeNonNegativeInteger(paragraph.textStart),
        textEnd: normalizeNonNegativeInteger(paragraph.textEnd),
        textLength: normalizeNonNegativeInteger(paragraph.textLength),
        previewStart: stringValue(paragraph.previewStart),
        previewEnd: stringValue(paragraph.previewEnd),
      },
    ];
  });
}

export function normalizeFocusCoReadingPlan(value: unknown): FocusCoReadingPlan | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const plan = recordValue(value);
  const id = stringValue(plan.id);
  const articleId = stringValue(plan.articleId);
  const createdAt = stringValue(plan.createdAt);
  const updatedAt = stringValue(plan.updatedAt);
  const selectedAgentIds = stringArray(plan.selectedAgentIds);
  const sections = Array.isArray(plan.sections)
    ? plan.sections.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const section = recordValue(item);
        const sectionId = stringValue(section.sectionId);
        if (!sectionId) return [];
        const sectionStart = Number(section.sectionStart);
        const sectionEnd = Number(section.sectionEnd);
        const messages = Array.isArray(section.messages)
          ? section.messages.flatMap((message) => {
              if (!message || typeof message !== 'object') return [];
              const messageRecord = recordValue(message);
              const messageId = stringValue(messageRecord.id);
              const content = stringValue(messageRecord.content);
              const messageCreatedAt = stringValue(messageRecord.createdAt);
              return messageId && content && messageCreatedAt
                ? [
                    {
                      id: messageId,
                      content,
                      agentId: stringValue(messageRecord.agentId) || undefined,
                      agentUsername: stringValue(messageRecord.agentUsername) || undefined,
                      agentNickname: stringValue(messageRecord.agentNickname) || undefined,
                      agentIds: stringArray(messageRecord.agentIds),
                      agentUsernames: stringArray(messageRecord.agentUsernames),
                      agentNicknames: stringArray(messageRecord.agentNicknames),
                      createdAt: messageCreatedAt,
                    },
                  ]
                : [];
            })
          : [];
        return [
          {
            sectionId,
            sectionTitle: stringValue(section.sectionTitle),
            sectionStart: Number.isFinite(sectionStart) ? sectionStart : 0,
            sectionEnd: Number.isFinite(sectionEnd) ? sectionEnd : 0,
            summary: stringValue(section.summary) || undefined,
            tag: stringValue(section.tag) || undefined,
            targetDensity: normalizeAnnotationDensity(section.targetDensity) || undefined,
            needsFurtherPlanning:
              typeof section.needsFurtherPlanning === 'boolean'
                ? section.needsFurtherPlanning
                : undefined,
            agentIds: stringArray(section.agentIds),
            messages,
          },
        ];
      })
    : [];
  if (!id || !articleId || !createdAt || !updatedAt) return undefined;
  return { id, articleId, selectedAgentIds, sections, createdAt, updatedAt };
}
