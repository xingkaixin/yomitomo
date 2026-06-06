import type {
  AgentReadingIntent,
  Annotation,
  AnnotationAuthor,
  AnnotationDistillation,
  AnnotationDistillationProposal,
  AnnotationDistillationProposalKind,
  AnnotationDistillationProposalStatus,
  AnnotationDistillationReviewSession,
  AnnotationDistillationStatus,
  AssistantRuntimeProgressSummary,
  AssistantRuntimeProgressStepStatus,
  AnnotationEvidenceSource,
  AnnotationType,
  AppSettings,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSummaryRecord,
  ArticleSourceType,
  Comment,
  DesktopStore,
  EbookChapterRecord,
  EbookMetadata,
  EpubBookIndex,
  EpubChapterIndex,
  EpubParagraphIndex,
  EpubSegmentIndex,
  FocusCoReadingPlan,
  PdfMetadata,
  PdfRect,
  PdfTextAnchor,
  ReaderChatMessage,
  ReaderChatSession,
  ReaderChatState,
  ReaderQuestionContext,
  TextAnchor,
} from '@yomitomo/shared';
import {
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
  normalizeAssistantExecutionMode,
  normalizeLibraryContentSources,
  normalizeReviewOpinionLabel,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  providerPresets,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import { defaultUser, normalizeUser } from './store-normalizers-user';
import {
  normalizeAgentKind,
  normalizeAnnotationDensity,
  normalizeModelNames,
  normalizePresetId,
  normalizeProviderModelInputMode,
  normalizeProviderType,
  normalizeTemperature,
} from './store-normalizers-provider-agent';

export {
  defaultUser,
  normalizeUser,
  rowToUser,
  userToRow,
  normalizeUsername,
} from './store-normalizers-user';
export {
  normalizeAgentKind,
  normalizeAgentUsername,
  normalizeAnnotationDensity,
  normalizeModelNames,
  normalizePresetId,
  normalizeProviderModelInputMode,
  normalizeProviderType,
  normalizeReasoningEffort,
  normalizeTemperature,
  rowToAgent,
  rowToProvider,
} from './store-normalizers-provider-agent';

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
type ArticleBaseRow = ArticleSummaryRow &
  Partial<Pick<ArticleRow, 'siteIconUrl' | 'leadImageUrl' | 'readerChatState'>>;

export const defaultStore: DesktopStore = {
  user: defaultUser,
  settings: {},
  providers: [],
  agents: [],
  articles: [],
};

export function rowToComment(row: typeof schema.comments.$inferSelect): Comment {
  return {
    id: row.id,
    author: normalizeAnnotationAuthor(row.author),
    content: row.content,
    createdAt: row.createdAt,
    replyTo: row.replyTo || undefined,
    agentId: row.agentId || undefined,
    agentUsername: row.agentUsername || undefined,
    agentNickname: row.agentNickname || undefined,
    agentAvatar: row.agentAvatar || undefined,
    agentAnnotationColor: row.agentAnnotationColor || undefined,
    readingIntent: normalizeAgentReadingIntent(row.readingIntent) || undefined,
    reviewLabel: normalizeReviewOpinionLabel(row.reviewLabel) || undefined,
    assistantProgress: normalizeAssistantRuntimeProgress(row.assistantProgress),
    userId: row.userId || undefined,
    userUsername: row.userUsername || undefined,
    userNickname: row.userNickname || undefined,
    userAvatar: row.userAvatar || undefined,
    userAnnotationColor: row.userAnnotationColor || undefined,
    pending: row.pending || undefined,
  };
}

export function rowToAnnotation(
  row: typeof schema.annotations.$inferSelect,
  comments: Comment[],
): Annotation {
  return {
    id: row.id,
    anchor: normalizeTextAnchor(row.anchor),
    author: normalizeAnnotationAuthor(row.author),
    annotationType: normalizeAnnotationType(row.annotationType) || undefined,
    readingIntent: normalizeAgentReadingIntent(row.readingIntent) || undefined,
    moveType: normalizeAnnotationMove(row.moveType) || undefined,
    whyHere: row.whyHere || undefined,
    evidenceUsed: normalizeAnnotationEvidenceUsed(row.evidenceUsed),
    confidence: normalizeAnnotationConfidence(row.confidence) || undefined,
    shouldShow: row.shouldShow ?? undefined,
    color: row.color,
    agentId: row.agentId || undefined,
    agentUsername: row.agentUsername || undefined,
    agentNickname: row.agentNickname || undefined,
    agentAvatar: row.agentAvatar || undefined,
    agentAnnotationColor: row.agentAnnotationColor || undefined,
    userId: row.userId || undefined,
    userUsername: row.userUsername || undefined,
    userNickname: row.userNickname || undefined,
    userAvatar: row.userAvatar || undefined,
    userAnnotationColor: row.userAnnotationColor || undefined,
    comments,
    distillation: normalizeAnnotationDistillation(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type ArticleSummaryCounts = {
  annotationCount: number;
  commentCount: number;
  distillationCount: number;
};

export function rowToArticle(row: ArticleRow, annotations: Annotation[]): ArticleRecord {
  return {
    ...rowToArticleBase(row, annotations),
    contentHtml: row.contentHtml || undefined,
    ebook: rowToEbook(row),
    pdf: rowToPdf(row),
    focusCoReadingPlan: normalizeFocusCoReadingPlan(row.focusCoReadingPlan),
  };
}

export function rowToArticleSummary(
  row: ArticleSummaryRow,
  annotations: Annotation[],
  counts?: ArticleSummaryCounts,
): ArticleSummaryRecord {
  const { readerChatState: _readerChatState, ...base } = rowToArticleBase(row, annotations, counts);
  return {
    ...base,
    ebook: rowToEbookSummary(row),
    pdf: rowToPdfSummary(row),
  };
}

function rowToArticleBase(
  row: ArticleBaseRow,
  annotations: Annotation[],
  counts = articleCountsFromAnnotations(annotations),
): ArticleRecord {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    sourceType: normalizeArticleSourceType(row.sourceType),
    title: row.title,
    byline: row.byline || undefined,
    excerpt: row.excerpt || undefined,
    siteName: row.siteName || undefined,
    siteIconUrl: row.siteIconUrl || undefined,
    leadImageUrl: row.leadImageUrl || undefined,
    themeColor: row.themeColor || undefined,
    contentHash: row.contentHash,
    readingProgress: normalizeArticleReadingProgress(row.readingProgress),
    readerChatState: normalizeReaderChatState(row.readerChatState, row.id),
    annotations,
    annotationCount: counts.annotationCount,
    commentCount: counts.commentCount,
    distillationCount: counts.distillationCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function articleCountsFromAnnotations(annotations: Annotation[]): ArticleSummaryCounts {
  return {
    annotationCount: annotations.length,
    commentCount: annotations.reduce(
      (count, annotation) =>
        count + annotation.comments.filter((comment) => !comment.replyTo).length,
      0,
    ),
    distillationCount: annotations.filter(
      (annotation) => annotation.distillation?.status === 'published',
    ).length,
  };
}

export function mergeSettingsForUpsert(settings: AppSettings, existing?: AppSettings): AppSettings {
  return {
    themeId: settingsFieldProvided(settings, 'themeId')
      ? settings.themeId || undefined
      : existing?.themeId || undefined,
    libraryPageSize: settingsFieldProvided(settings, 'libraryPageSize')
      ? normalizeLibraryPageSize(settings.libraryPageSize)
      : normalizeLibraryPageSize(existing?.libraryPageSize),
    libraryContentSources: settingsFieldProvided(settings, 'libraryContentSources')
      ? normalizeLibraryContentSources(settings.libraryContentSources)
      : normalizeLibraryContentSources(existing?.libraryContentSources),
    defaultProviderId: settingsFieldProvided(settings, 'defaultProviderId')
      ? settings.defaultProviderId || undefined
      : existing?.defaultProviderId || undefined,
    readingAssistantProviderId: settingsFieldProvided(settings, 'readingAssistantProviderId')
      ? settings.readingAssistantProviderId || undefined
      : existing?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settingsFieldProvided(settings, 'reviewAssistantProviderId')
      ? settings.reviewAssistantProviderId || undefined
      : existing?.reviewAssistantProviderId || undefined,
    assistantExecutionMode: settingsFieldProvided(settings, 'assistantExecutionMode')
      ? normalizeAssistantExecutionMode(settings.assistantExecutionMode)
      : normalizeAssistantExecutionMode(existing?.assistantExecutionMode),
    messageSendShortcut: settingsFieldProvided(settings, 'messageSendShortcut')
      ? normalizeMessageSendShortcut(settings.messageSendShortcut)
      : normalizeMessageSendShortcut(existing?.messageSendShortcut),
    selectionActionShortcuts: settingsFieldProvided(settings, 'selectionActionShortcuts')
      ? normalizeSelectionActionShortcuts(settings.selectionActionShortcuts)
      : normalizeSelectionActionShortcuts(existing?.selectionActionShortcuts),
    saveArticleImages: settingsFieldProvided(settings, 'saveArticleImages')
      ? Boolean(settings.saveArticleImages)
      : Boolean(existing?.saveArticleImages),
    developerModeEnabled: settingsFieldProvided(settings, 'developerModeEnabled')
      ? Boolean(settings.developerModeEnabled)
      : Boolean(existing?.developerModeEnabled),
    logRetentionDays: settingsFieldProvided(settings, 'logRetentionDays')
      ? normalizeLogRetentionDays(settings.logRetentionDays)
      : normalizeLogRetentionDays(existing?.logRetentionDays),
    onboardingCompletedAt: settingsFieldProvided(settings, 'onboardingCompletedAt')
      ? settings.onboardingCompletedAt || undefined
      : existing?.onboardingCompletedAt || undefined,
    lastSeenVersion: settingsFieldProvided(settings, 'lastSeenVersion')
      ? settings.lastSeenVersion || undefined
      : existing?.lastSeenVersion || undefined,
  };
}

function settingsFieldProvided(settings: AppSettings, field: keyof AppSettings) {
  return Object.prototype.hasOwnProperty.call(settings, field);
}

export function normalizeStore(store: DesktopStore): DesktopStore {
  return {
    user: normalizeUser(store.user),
    settings: normalizeSettings(store.settings),
    providers: (store.providers || []).map((provider) => {
      const presetId = normalizePresetId(provider.presetId);
      const preset = providerPresets.find((item) => item.id === presetId);
      return Object.assign({}, provider, {
        type: preset?.type || normalizeProviderType(provider.type) || 'openai-chat',
        presetId,
        modelNames:
          provider.modelInputMode === 'custom'
            ? undefined
            : normalizeModelNames(provider.modelNames),
        modelInputMode: normalizeProviderModelInputMode(provider.modelInputMode) || 'list',
        reasoningEffort: 'none',
      });
    }),
    agents: (store.agents || []).map((agent) =>
      Object.assign({}, agent, {
        annotationColor: agent.annotationColor || '#8ab6d6',
        kind: normalizeAgentKind(agent.kind) || 'annotation',
        enabled: agent.enabled ?? true,
        annotationDensity: normalizeAnnotationDensity(agent.annotationDensity) || 'medium',
        temperature: normalizeTemperature(agent.temperature),
      }),
    ),
    articles: (store.articles || []).map((article) =>
      Object.assign({}, article, {
        sourceType: normalizeArticleSourceType(article.sourceType),
        ebook: normalizeEbookRecord(article.ebook),
        pdf: normalizePdfRecord(article.pdf),
        readingProgress: normalizeArticleReadingProgress(article.readingProgress),
      }),
    ),
  };
}

export function rowToSettings(
  row: typeof schema.appSettings.$inferSelect | undefined,
): AppSettings {
  return {
    themeId: row?.themeId || undefined,
    libraryPageSize: normalizeLibraryPageSize(row?.libraryPageSize),
    libraryContentSources: normalizeLibraryContentSources(row?.libraryContentSources),
    defaultProviderId: row?.defaultProviderId || undefined,
    readingAssistantProviderId: row?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: row?.reviewAssistantProviderId || undefined,
    assistantExecutionMode: normalizeAssistantExecutionMode(row?.assistantExecutionMode),
    messageSendShortcut: normalizeMessageSendShortcut(row?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(row?.selectionActionShortcuts),
    saveArticleImages: Boolean(row?.saveArticleImages),
    developerModeEnabled: Boolean(row?.developerModeEnabled),
    logRetentionDays: normalizeLogRetentionDays(row?.logRetentionDays),
    onboardingCompletedAt: row?.onboardingCompletedAt || undefined,
    lastSeenVersion: row?.lastSeenVersion || undefined,
  };
}

function normalizeSettings(settings: AppSettings | undefined): AppSettings {
  return {
    themeId: settings?.themeId || undefined,
    libraryPageSize: normalizeLibraryPageSize(settings?.libraryPageSize),
    libraryContentSources: normalizeLibraryContentSources(settings?.libraryContentSources),
    defaultProviderId: settings?.defaultProviderId || undefined,
    readingAssistantProviderId: settings?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settings?.reviewAssistantProviderId || undefined,
    assistantExecutionMode: normalizeAssistantExecutionMode(settings?.assistantExecutionMode),
    messageSendShortcut: normalizeMessageSendShortcut(settings?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(settings?.selectionActionShortcuts),
    saveArticleImages: Boolean(settings?.saveArticleImages),
    developerModeEnabled: Boolean(settings?.developerModeEnabled),
    logRetentionDays: normalizeLogRetentionDays(settings?.logRetentionDays),
    onboardingCompletedAt: settings?.onboardingCompletedAt || undefined,
    lastSeenVersion: settings?.lastSeenVersion || undefined,
  };
}

function normalizeLogRetentionDays(value: unknown) {
  return value === 15 || value === 30 || value === 90 ? value : undefined;
}

function normalizeLibraryPageSize(value: unknown) {
  return value === 6 || value === 12 || value === 18 || value === 24 ? value : undefined;
}

function rowToEbook(row: ArticleRow): ArticleRecord['ebook'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'ebook') return undefined;

  const metadata = normalizeEbookMetadata(row.ebookMetadata);
  const chapters = normalizeEbookChapters(row.ebookChapters);
  const index = normalizeEpubBookIndex(row.ebookIndex);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

function rowToEbookSummary(row: ArticleSummaryRow): ArticleSummaryRecord['ebook'] {
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

function normalizeEbookRecord(
  value: ArticleRecord['ebook'] | ArticleSummaryRecord['ebook'] | undefined,
): ArticleRecord['ebook'] {
  const metadata = normalizeEbookMetadata(value?.metadata);
  const chapters = normalizeEbookChapters(
    value && 'chapters' in value ? value.chapters : undefined,
  );
  const index = normalizeEpubBookIndex(value && 'index' in value ? value.index : undefined);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

function rowToPdf(row: ArticleRow): ArticleRecord['pdf'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'pdf') return undefined;

  const metadata = normalizePdfMetadata(row.pdfMetadata);
  return metadata ? { metadata } : undefined;
}

function rowToPdfSummary(row: ArticleSummaryRow): ArticleRecord['pdf'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'pdf') return undefined;

  const metadata = normalizePdfMetadata(row.pdfMetadata);
  return metadata ? { metadata } : undefined;
}

function normalizePdfRecord(value: ArticleRecord['pdf'] | undefined): ArticleRecord['pdf'] {
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
    format: metadata.format === 'epub' ? 'epub' : 'epub',
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function recordValue(value: object): Record<string, unknown> {
  return Object.entries(value).reduce<Record<string, unknown>>((record, [key, entryValue]) => {
    record[key] = entryValue;
    return record;
  }, {});
}

function normalizeAnnotationAuthor(value: unknown): AnnotationAuthor {
  return value === 'ai' ? 'ai' : 'user';
}

function normalizeAnnotationDistillation(
  row: typeof schema.annotations.$inferSelect,
): AnnotationDistillation | undefined {
  const status = normalizeAnnotationDistillationStatus(row.distillationStatus);
  if (!status && !row.distillationContent) return undefined;
  return {
    status: status || 'unpublished',
    content: row.distillationContent || '',
    publishedAt: row.distillationPublishedAt || undefined,
    updatedAt: row.distillationUpdatedAt || undefined,
    reviewSessions: normalizeAnnotationDistillationReviewSessions(row.distillationReviewSessions),
  };
}

function normalizeAnnotationDistillationStatus(
  value: unknown,
): AnnotationDistillationStatus | null {
  return value === 'published' || value === 'unpublished' ? value : null;
}

function normalizeAnnotationDistillationReviewSessions(
  value: unknown,
): AnnotationDistillationReviewSession[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sessions = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const session = recordValue(item);
    const id = stringValue(session.id);
    const agentId = stringValue(session.agentId);
    if (!id || !agentId) return [];
    return [
      {
        id,
        agentId,
        agentUsername: stringValue(session.agentUsername) || undefined,
        agentNickname: stringValue(session.agentNickname) || undefined,
        agentAvatar: stringValue(session.agentAvatar) || undefined,
        messages: normalizeAnnotationDistillationReviewMessages(session.messages),
        createdAt: stringValue(session.createdAt),
        updatedAt: stringValue(session.updatedAt),
      },
    ];
  });
  return sessions.length > 0 ? sessions : undefined;
}

function normalizeAnnotationDistillationReviewMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const message = recordValue(item);
    const id = stringValue(message.id);
    const content = stringValue(message.content);
    if (!id || !content) return [];
    return [
      {
        id,
        author: normalizeAnnotationAuthor(message.author),
        content,
        createdAt: stringValue(message.createdAt),
        agentId: stringValue(message.agentId) || undefined,
        agentUsername: stringValue(message.agentUsername) || undefined,
        agentNickname: stringValue(message.agentNickname) || undefined,
        agentAvatar: stringValue(message.agentAvatar) || undefined,
        assistantProgress: normalizeAssistantRuntimeProgress(message.assistantProgress),
        proposals: normalizeAnnotationDistillationProposals(message.proposals),
      },
    ];
  });
}

function normalizeAnnotationDistillationProposals(
  value: unknown,
): AnnotationDistillationProposal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const proposal = recordValue(item);
    const id = stringValue(proposal.id);
    const kind = normalizeAnnotationDistillationProposalKind(proposal.kind);
    if (!id || !kind) return [];

    const content = stringValue(proposal.content);
    const targetText = stringValue(proposal.targetText);
    const replacementText = stringValue(proposal.replacementText);
    if (!validAnnotationDistillationProposalFields(kind, content, targetText, replacementText)) {
      return [];
    }

    return [
      {
        id,
        kind,
        status: normalizeAnnotationDistillationProposalStatus(proposal.status),
        title: stringValue(proposal.title) || proposalTitleFallback(kind, content, targetText),
        rationale: stringValue(proposal.rationale) || undefined,
        insertAfterText: stringValue(proposal.insertAfterText) || undefined,
        targetText: targetText || undefined,
        replacementText: kind === 'replace' ? replacementText : undefined,
        content: kind === 'insert' ? content : undefined,
        acceptedAt: stringValue(proposal.acceptedAt) || undefined,
        ignoredAt: stringValue(proposal.ignoredAt) || undefined,
        updatedAt: stringValue(proposal.updatedAt),
      },
    ];
  });
}

function normalizeAnnotationDistillationProposalKind(
  value: unknown,
): AnnotationDistillationProposalKind | null {
  return value === 'insert' || value === 'replace' || value === 'delete' ? value : null;
}

function normalizeAnnotationDistillationProposalStatus(
  value: unknown,
): AnnotationDistillationProposalStatus {
  return value === 'accepted' || value === 'ignored' || value === 'pending' ? value : 'pending';
}

function validAnnotationDistillationProposalFields(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  replacementText: string,
) {
  if (kind === 'insert') return Boolean(content);
  if (kind === 'replace') return Boolean(targetText && replacementText);
  return Boolean(targetText);
}

function proposalTitleFallback(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
) {
  const text = kind === 'insert' ? content : targetText;
  const preview = text.length > 18 ? `${text.slice(0, 18)}...` : text;
  if (kind === 'insert') return preview ? `新增：${preview}` : '新增内容';
  if (kind === 'replace') return preview ? `修改：${preview}` : '修改内容';
  return preview ? `删除：${preview}` : '删除内容';
}

function normalizeAssistantRuntimeProgress(
  value: unknown,
): AssistantRuntimeProgressSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const progress = recordValue(value);
  const steps = Array.isArray(progress.steps)
    ? progress.steps.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const step = recordValue(item);
        const id = stringValue(step.id);
        const label = stringValue(step.label);
        const status = normalizeAssistantRuntimeProgressStepStatus(step.status);
        if (!id || !label || !status) return [];
        return [{ id, label, status }];
      })
    : [];
  const fallbackMessage = stringValue(progress.fallbackMessage);
  if (steps.length === 0 && !fallbackMessage) return undefined;
  return {
    steps,
    fallbackMessage: fallbackMessage || undefined,
  };
}

function normalizeAssistantRuntimeProgressStepStatus(
  value: unknown,
): AssistantRuntimeProgressStepStatus | null {
  return value === 'active' || value === 'done' || value === 'failed' ? value : null;
}

function normalizeTextAnchor(value: unknown): TextAnchor {
  const anchor = value && typeof value === 'object' ? recordValue(value) : {};
  const textAnchor: TextAnchor = {
    exact: stringValue(anchor.exact),
    prefix: stringValue(anchor.prefix),
    suffix: stringValue(anchor.suffix),
    start: normalizeNonNegativeInteger(anchor.start),
    end: normalizeNonNegativeInteger(anchor.end),
    paragraphId: stringValue(anchor.paragraphId) || undefined,
    chapterId: stringValue(anchor.chapterId) || undefined,
    segmentId: stringValue(anchor.segmentId) || undefined,
    textStartInParagraph:
      anchor.textStartInParagraph === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textStartInParagraph),
    textEndInParagraph:
      anchor.textEndInParagraph === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textEndInParagraph),
    textStartInBook:
      anchor.textStartInBook === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textStartInBook),
    textEndInBook:
      anchor.textEndInBook === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textEndInBook),
    quoteHash: stringValue(anchor.quoteHash) || undefined,
  };
  if (anchor.kind !== 'pdf-text') return textAnchor;

  const pdfAnchor: PdfTextAnchor = {
    ...textAnchor,
    kind: 'pdf-text',
    pageIndex: normalizeNonNegativeInteger(anchor.pageIndex),
    pageWidth: normalizePositiveNumber(anchor.pageWidth),
    pageHeight: normalizePositiveNumber(anchor.pageHeight),
    rects: normalizePdfRects(anchor.rects),
  };
  return pdfAnchor;
}

function normalizePdfRects(value: unknown): PdfRect[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const rect = recordValue(item);
    return [
      {
        x: normalizeFiniteNumber(rect.x),
        y: normalizeFiniteNumber(rect.y),
        width: normalizeFiniteNumber(rect.width),
        height: normalizeFiniteNumber(rect.height),
      },
    ];
  });
}

function normalizePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeReaderChatState(
  value: unknown,
  ownerArticleId?: string,
): ReaderChatState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = recordValue(value);
  const articleId = stringValue(state.articleId);
  const activeSessionId = stringValue(state.activeSessionId);
  const createdAt = stringValue(state.createdAt);
  const updatedAt = stringValue(state.updatedAt);
  const expectedArticleId = ownerArticleId || articleId;
  if (!articleId || articleId !== expectedArticleId || !activeSessionId || !createdAt || !updatedAt)
    return undefined;

  const sessions = normalizeReaderChatSessions(state.sessions, articleId);
  if (!sessions.some((session) => session.id === activeSessionId)) return undefined;

  return {
    articleId,
    activeSessionId,
    selectedAssistantId: stringValue(state.selectedAssistantId) || undefined,
    sessions,
    createdAt,
    updatedAt,
  };
}

function normalizeReaderChatSessions(value: unknown, articleId: string): ReaderChatSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const session = recordValue(item);
    const id = stringValue(session.id);
    const sessionArticleId = stringValue(session.articleId);
    const createdAt = stringValue(session.createdAt);
    const updatedAt = stringValue(session.updatedAt);
    if (!id || sessionArticleId !== articleId || !createdAt || !updatedAt) return [];
    return [
      {
        id,
        articleId,
        title: stringValue(session.title) || undefined,
        createdAt,
        updatedAt,
        messages: normalizeReaderChatMessages(session.messages),
      },
    ];
  });
}

function normalizeReaderChatMessages(value: unknown): ReaderChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const message = recordValue(item);
    const id = stringValue(message.id);
    const role = normalizeReaderChatMessageRole(message.role);
    const content = stringValue(message.content);
    const createdAt = stringValue(message.createdAt);
    if (!id || !role || !content || !createdAt) return [];
    return [
      {
        id,
        role,
        content,
        assistantId: stringValue(message.assistantId) || undefined,
        context: normalizeReaderQuestionContext(message.context),
        createdAt,
      },
    ];
  });
}

function normalizeReaderChatMessageRole(value: unknown): ReaderChatMessage['role'] | null {
  return value === 'user' || value === 'assistant' ? value : null;
}

function normalizeReaderQuestionContext(value: unknown): ReaderQuestionContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const context = recordValue(value);
  const sourceType = normalizeArticleSourceType(context.sourceType);
  const quote = stringValue(context.quote);
  if (!quote) return undefined;
  return {
    sourceType,
    quote,
    title: stringValue(context.title) || undefined,
    locationLabel: stringValue(context.locationLabel) || undefined,
    anchor:
      context.anchor && typeof context.anchor === 'object'
        ? normalizeTextAnchor(context.anchor)
        : undefined,
    nearbyText: stringValue(context.nearbyText) || undefined,
  };
}

function normalizeFocusCoReadingPlan(value: unknown): FocusCoReadingPlan | undefined {
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

export function sortByCreatedAt<T extends { createdAt: string }>(items: T[]) {
  return [...items].toSorted(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
}

function normalizeAnnotationType(value: unknown): AnnotationType | null {
  return value === 'key_point' ||
    value === 'assumption' ||
    value === 'concept' ||
    value === 'question' ||
    value === 'quote'
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

function normalizeAgentReadingIntent(value: unknown): AgentReadingIntent | null {
  return value === 'explain' ||
    value === 'decompose' ||
    value === 'challenge' ||
    value === 'question' ||
    value === 'connect'
    ? value
    : null;
}
