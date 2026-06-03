import type { AgentAnnotationDensity } from '../agents/agent-types';
import type { Annotation } from '../annotation-types';
import type { EbookRecord, EbookSummaryRecord } from './ebook-types';
import type { PdfRecord } from './pdf-types';
import type { ReadingMemory } from '../reading-memory/reading-memory-types';

export type ArticleSourceType = 'web' | 'ebook' | 'pdf';

export type ArticleReadingProgress = {
  pageIndex: number;
  pageCount: number;
  chapterIndex?: number;
  chapterProgress?: number;
  progress: number;
  updatedAt: string;
};

export type ArticleReadingProgressPatch = {
  articleId: string;
  readingProgress: ArticleReadingProgress;
  updatedAt: string;
};

export type ArticleUpsertPatch = {
  type: 'article-upsert';
  article: ArticleSummaryRecord;
};

export type ArticleDeletePatch = {
  articleId: string;
};

export type ArticleStorePatch =
  | ArticleUpsertPatch
  | (ArticleReadingProgressPatch & { type: 'article-reading-progress' })
  | (ArticleDeletePatch & { type: 'article-delete' });

export type ArticleRecord = {
  id: string;
  url: string;
  canonicalUrl: string;
  sourceType?: ArticleSourceType;
  title: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  siteIconUrl?: string;
  leadImageUrl?: string;
  themeColor?: string;
  contentHtml?: string;
  contentHash: string;
  ebook?: EbookRecord;
  pdf?: PdfRecord;
  readingProgress?: ArticleReadingProgress;
  annotations: Annotation[];
  annotationCount?: number;
  commentCount?: number;
  distillationCount?: number;
  focusCoReadingPlan?: FocusCoReadingPlan;
  createdAt: string;
  updatedAt: string;
};

export type ArticleSummaryRecord = Omit<
  ArticleRecord,
  'contentHtml' | 'ebook' | 'focusCoReadingPlan'
> & {
  ebook?: EbookSummaryRecord;
};

export type FocusCoReadingMessage = {
  id: string;
  content: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentIds?: string[];
  agentUsernames?: string[];
  agentNicknames?: string[];
  createdAt: string;
};

export type FocusCoReadingSectionPlan = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  summary?: string;
  tag?: string;
  targetDensity?: AgentAnnotationDensity;
  needsFurtherPlanning?: boolean;
  agentIds: string[];
  messages: FocusCoReadingMessage[];
};

export type FocusCoReadingPlan = {
  id: string;
  articleId: string;
  selectedAgentIds: string[];
  sections: FocusCoReadingSectionPlan[];
  readingMemory?: ReadingMemory;
  createdAt: string;
  updatedAt: string;
};
