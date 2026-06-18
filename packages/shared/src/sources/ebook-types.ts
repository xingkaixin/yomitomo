export type EbookFormat = 'epub' | 'azw3' | 'mobi';

export type EbookMetadata = {
  format: EbookFormat;
  fileName: string;
  fileSize: number;
  originalTitle?: string;
  displayTitle?: string;
  titleCleanupVersion?: 1;
  language?: string;
  publisher?: string;
  description?: string;
};

export type EbookChapterRecord = {
  id: string;
  title: string;
  href?: string;
  html: string;
  textLength: number;
};

export type EpubParagraphIndex = {
  id: string;
  chapterId: string;
  segmentId: string;
  indexInChapter: number;
  indexInSegment: number;
  textStart: number;
  textEnd: number;
  textLength: number;
  previewStart: string;
  previewEnd: string;
};

export type EpubSegmentIndex = {
  id: string;
  chapterId: string;
  indexInChapter: number;
  textStart: number;
  textEnd: number;
  textLength: number;
  previewStart: string;
  previewEnd: string;
  paragraphIds: string[];
};

export type EpubChapterIndex = {
  id: string;
  title: string;
  href?: string;
  indexInBook: number;
  textStart: number;
  textEnd: number;
  textLength: number;
  previewStart: string;
  previewEnd: string;
  segmentIds: string[];
  paragraphIds: string[];
};

export type EpubBookIndex = {
  version: 1;
  articleId: string;
  textLength: number;
  chapters: EpubChapterIndex[];
  segments: EpubSegmentIndex[];
  paragraphs: EpubParagraphIndex[];
};

export type EbookRecord = {
  metadata: EbookMetadata;
  chapters: EbookChapterRecord[];
  index?: EpubBookIndex;
};

export type EbookSummaryRecord = {
  metadata: EbookMetadata;
};
