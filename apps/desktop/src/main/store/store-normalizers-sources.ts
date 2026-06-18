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
} from '@yomitomo/shared';
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
  | 'readingProgress'
  | 'createdAt'
  | 'updatedAt'
>;

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
  return metadata ? { metadata } : undefined;
}

export function normalizeArticleSourceType(value: unknown): ArticleSourceType {
  if (value === 'ebook' || value === 'pdf') return value;
  return 'web';
}

export function normalizeArticleReadingProgress(
  value: unknown,
): ArticleReadingProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const progress = recordValue(value);
  const pageIndex = Number(progress.pageIndex);
  const pageCount = Number(progress.pageCount);
  const chapterIndex = Number(progress.chapterIndex);
  const chapterProgress = Number(progress.chapterProgress);
  const progressValue = Number(progress.progress);
  return {
    pageIndex: Number.isInteger(pageIndex) && pageIndex >= 0 ? pageIndex : 0,
    pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 1,
    chapterIndex: Number.isInteger(chapterIndex) && chapterIndex >= 0 ? chapterIndex : undefined,
    chapterProgress: Number.isFinite(chapterProgress)
      ? Math.max(0, Math.min(1, chapterProgress))
      : undefined,
    progress: Number.isFinite(progressValue) ? Math.max(0, Math.min(1, progressValue)) : 0,
    updatedAt: stringValue(progress.updatedAt) || new Date().toISOString(),
  };
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
  return metadata ? { metadata } : undefined;
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
