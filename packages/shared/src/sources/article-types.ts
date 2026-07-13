import type { AgentAnnotationDensity } from '../agents/agent-types';
import type { PdfTextAnchor, TextAnchor } from '../anchor-types';
import type { Annotation } from '../annotation-types';
import type { EbookRecord, EbookSummaryRecord } from './ebook-types';
import type { PdfRecord } from './pdf-types';
import type { ReadingMemory } from '../reading-memory/reading-memory-types';

export type ArticleSourceType = 'web' | 'ebook' | 'pdf' | 'text';

export type TextSourceFormat = 'plain' | 'markdown';

export type TextSourceMetadata = {
  format: TextSourceFormat;
};

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

export type ReaderQuestionContext = {
  sourceType: ArticleSourceType;
  quote: string;
  title?: string;
  locationLabel?: string;
  anchor?: TextAnchor | PdfTextAnchor;
  nearbyText?: string;
};

export type ReaderChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  assistantId?: string;
  context?: ReaderQuestionContext;
  createdAt: string;
};

export type ReaderChatSession = {
  id: string;
  articleId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messages: ReaderChatMessage[];
};

export type ReaderChatState = {
  articleId: string;
  activeSessionId: string;
  selectedAssistantId?: string;
  sessions: ReaderChatSession[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleReaderChatStatePatch = {
  type: 'article-reader-chat-state';
  articleId: string;
  readerChatState?: ReaderChatState;
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

export type ArticleTranslationStatus = 'idle' | 'translating' | 'ready' | 'failed';

export type ArticleTranslationSegment = {
  id: string;
  translationId: string;
  sourceBlockId: string;
  sourceTextHash: string;
  sourceText: string;
  translatedText?: string;
  status: ArticleTranslationStatus;
  error?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type ArticleTranslation = {
  id: string;
  articleId: string;
  sourceContentHash: string;
  targetLanguage: string;
  promptVersion: number;
  providerId?: string;
  providerName?: string;
  modelName?: string;
  status: ArticleTranslationStatus;
  error?: string;
  segments: ArticleTranslationSegment[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleTranslationRequest = {
  articleId: string;
  sourceBlockIds?: string[];
  targetLanguage?: string;
  force?: boolean;
};

export type ArticleTranslationDeleteRequest = {
  articleId: string;
  targetLanguage?: string;
};

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
  text?: TextSourceMetadata;
  readingProgress?: ArticleReadingProgress;
  annotations: Annotation[];
  annotationCount?: number;
  commentCount?: number;
  thoughtCount?: number;
  discussionCommentCount?: number;
  aiCommentCount?: number;
  distillationCount?: number;
  focusCoReadingPlan?: FocusCoReadingPlan;
  readerChatState?: ReaderChatState;
  createdAt: string;
  updatedAt: string;
};

export type ArticleSummaryRecord = Omit<
  ArticleRecord,
  'contentHtml' | 'ebook' | 'focusCoReadingPlan' | 'readerChatState'
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
