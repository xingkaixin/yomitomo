import type {
  Agent,
  AgentAnnotationDensity,
  AgentKind,
  AgentReadingIntent,
  Annotation,
  AnnotationEvidenceSource,
  AnnotationType,
  AppSettings,
  ArticleReadingProgress,
  ArticleRecord,
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
  LlmProvider,
  ProviderPresetId,
  ProviderType,
  ReasoningEffort,
  TextAnchor,
  UserProfile,
} from '@yomitomo/shared';
import {
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
  normalizeReviewOpinionLabel,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  providerPresets,
} from '@yomitomo/shared';
import * as schema from './db/schema';

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
  | 'readingProgress'
  | 'createdAt'
  | 'updatedAt'
>;
type ArticleBaseRow = ArticleSummaryRow & Partial<Pick<ArticleRow, 'siteIconUrl' | 'leadImageUrl'>>;

export const defaultUser: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: new Date(0).toISOString(),
};

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
    author: row.author as Comment['author'],
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
    anchor: row.anchor as TextAnchor,
    author: row.author as Annotation['author'],
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToProvider(row: typeof schema.providers.$inferSelect): LlmProvider {
  const presetId = normalizePresetId(row.presetId || undefined);
  const preset = providerPresets.find((item) => item.id === presetId);
  return {
    id: row.id,
    name: row.name,
    type: preset?.type || normalizeProviderType(row.type) || 'openai-chat',
    presetId,
    logo: row.logo || undefined,
    baseUrl: row.baseUrl,
    apiKey: '',
    hasApiKey: Boolean(row.apiKeyRef || row.apiKey),
    modelName: row.modelName,
    modelNames: normalizeModelNames(row.modelNames) || undefined,
    modelInputMode: normalizeProviderModelInputMode(row.modelInputMode) || 'list',
    reasoningEffort: 'none',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToAgent(row: typeof schema.agents.$inferSelect): Agent {
  return {
    id: row.id,
    kind: normalizeAgentKind(row.kind) || 'annotation',
    presetId: row.presetId || undefined,
    enabled: Boolean(row.enabled),
    providerId: row.providerId,
    nickname: row.nickname,
    username: row.username,
    avatar: row.avatar,
    annotationColor: row.annotationColor || '#8ab6d6',
    annotationDensity: normalizeAnnotationDensity(row.annotationDensity) || 'medium',
    temperature: normalizeTemperature(row.temperature),
    soul: row.soul,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type ArticleSummaryCounts = {
  annotationCount: number;
  commentCount: number;
};

export function rowToArticle(row: ArticleRow, annotations: Annotation[]): ArticleRecord {
  return {
    ...rowToArticleBase(row, annotations),
    contentHtml: row.contentHtml || undefined,
    ebook: rowToEbook(row),
    focusCoReadingPlan: row.focusCoReadingPlan
      ? (row.focusCoReadingPlan as FocusCoReadingPlan)
      : undefined,
  };
}

export function rowToArticleSummary(
  row: ArticleSummaryRow,
  annotations: Annotation[],
  counts?: ArticleSummaryCounts,
): ArticleRecord {
  return {
    ...rowToArticleBase(row, annotations, counts),
    ebook: rowToEbookSummary(row),
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
    annotations,
    annotationCount: counts.annotationCount,
    commentCount: counts.commentCount,
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
  };
}

export function mergeSettingsForUpsert(settings: AppSettings, existing?: AppSettings): AppSettings {
  return {
    defaultProviderId: settingsFieldProvided(settings, 'defaultProviderId')
      ? settings.defaultProviderId || undefined
      : existing?.defaultProviderId || undefined,
    readingAssistantProviderId: settingsFieldProvided(settings, 'readingAssistantProviderId')
      ? settings.readingAssistantProviderId || undefined
      : existing?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settingsFieldProvided(settings, 'reviewAssistantProviderId')
      ? settings.reviewAssistantProviderId || undefined
      : existing?.reviewAssistantProviderId || undefined,
    messageSendShortcut: settingsFieldProvided(settings, 'messageSendShortcut')
      ? normalizeMessageSendShortcut(settings.messageSendShortcut)
      : normalizeMessageSendShortcut(existing?.messageSendShortcut),
    selectionActionShortcuts: settingsFieldProvided(settings, 'selectionActionShortcuts')
      ? normalizeSelectionActionShortcuts(settings.selectionActionShortcuts)
      : normalizeSelectionActionShortcuts(existing?.selectionActionShortcuts),
    saveArticleImages: settingsFieldProvided(settings, 'saveArticleImages')
      ? Boolean(settings.saveArticleImages)
      : Boolean(existing?.saveArticleImages),
    logRetentionDays: settingsFieldProvided(settings, 'logRetentionDays')
      ? normalizeLogRetentionDays(settings.logRetentionDays)
      : normalizeLogRetentionDays(existing?.logRetentionDays),
    onboardingCompletedAt: settingsFieldProvided(settings, 'onboardingCompletedAt')
      ? settings.onboardingCompletedAt || undefined
      : existing?.onboardingCompletedAt || undefined,
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
        readingProgress: normalizeArticleReadingProgress(article.readingProgress),
      }),
    ),
  };
}

export function rowToSettings(
  row: typeof schema.appSettings.$inferSelect | undefined,
): AppSettings {
  return {
    defaultProviderId: row?.defaultProviderId || undefined,
    readingAssistantProviderId: row?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: row?.reviewAssistantProviderId || undefined,
    messageSendShortcut: normalizeMessageSendShortcut(row?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(row?.selectionActionShortcuts),
    saveArticleImages: Boolean(row?.saveArticleImages),
    logRetentionDays: normalizeLogRetentionDays(row?.logRetentionDays),
    onboardingCompletedAt: row?.onboardingCompletedAt || undefined,
  };
}

function normalizeSettings(settings: AppSettings | undefined): AppSettings {
  return {
    defaultProviderId: settings?.defaultProviderId || undefined,
    readingAssistantProviderId: settings?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settings?.reviewAssistantProviderId || undefined,
    messageSendShortcut: normalizeMessageSendShortcut(settings?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(settings?.selectionActionShortcuts),
    saveArticleImages: Boolean(settings?.saveArticleImages),
    logRetentionDays: normalizeLogRetentionDays(settings?.logRetentionDays),
    onboardingCompletedAt: settings?.onboardingCompletedAt || undefined,
  };
}

function normalizeLogRetentionDays(value: unknown) {
  return value === 15 || value === 30 || value === 90 ? value : undefined;
}

function rowToEbook(row: ArticleRow): ArticleRecord['ebook'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'ebook') return undefined;

  const metadata = normalizeEbookMetadata(row.ebookMetadata);
  const chapters = normalizeEbookChapters(row.ebookChapters);
  const index = normalizeEpubBookIndex(row.ebookIndex);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

function rowToEbookSummary(row: ArticleSummaryRow): ArticleRecord['ebook'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'ebook') return undefined;

  const metadata = normalizeEbookMetadata(row.ebookMetadata);
  return metadata ? { metadata, chapters: [] } : undefined;
}

export function normalizeArticleSourceType(value: unknown): ArticleSourceType {
  return value === 'ebook' ? 'ebook' : 'web';
}

export function normalizeArticleReadingProgress(
  value: unknown,
): ArticleReadingProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const progress = value as Record<string, unknown>;
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

function normalizeEbookRecord(value: ArticleRecord['ebook'] | undefined): ArticleRecord['ebook'] {
  const metadata = normalizeEbookMetadata(value?.metadata);
  const chapters = normalizeEbookChapters(value?.chapters);
  const index = normalizeEpubBookIndex(value?.index);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

function normalizeEbookMetadata(value: unknown): EbookMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = value as Record<string, unknown>;
  const fileName = stringValue(metadata.fileName);
  const fileSize = Number(metadata.fileSize);
  return {
    format: metadata.format === 'epub' ? 'epub' : 'epub',
    fileName,
    fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0,
    language: stringValue(metadata.language) || undefined,
    publisher: stringValue(metadata.publisher) || undefined,
    description: stringValue(metadata.description) || undefined,
  };
}

function normalizeEbookChapters(value: unknown): EbookChapterRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const chapter = item as Record<string, unknown>;
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
  const index = value as Record<string, unknown>;
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
    const chapter = item as Record<string, unknown>;
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
    const segment = item as Record<string, unknown>;
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
    const paragraph = item as Record<string, unknown>;
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

export function normalizeUser(user: Partial<UserProfile> | undefined): UserProfile {
  return {
    ...defaultUser,
    ...user,
    id: user?.id || defaultUser.id,
    annotationColor: user?.annotationColor || defaultUser.annotationColor,
  };
}

export function rowToUser(row: typeof schema.userProfiles.$inferSelect | undefined): UserProfile {
  if (!row) return defaultUser;
  return {
    id: row.id,
    nickname: row.nickname,
    username: row.username,
    avatar: row.avatar,
    annotationColor: row.annotationColor,
    updatedAt: row.updatedAt,
  };
}

export function userToRow(user: UserProfile): typeof schema.userProfiles.$inferInsert {
  return {
    id: user.id,
    nickname: user.nickname,
    username: user.username,
    avatar: user.avatar,
    annotationColor: user.annotationColor,
    updatedAt: user.updatedAt,
  };
}

export function sortByCreatedAt<T extends { createdAt: string }>(items: T[]) {
  return [...items].toSorted(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
}

export function normalizeUsername(value: string, fallback = 'me') {
  return (
    value
      .trim()
      .replace(/^@/, '')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .slice(0, 32) || fallback
  );
}

export function normalizeAgentUsername(value: string, fallback = 'agent') {
  return value.trim().replace(/^@/, '').replace(/\s+/g, '').slice(0, 32) || fallback;
}

export function normalizeAnnotationDensity(value: unknown): AgentAnnotationDensity | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

export function normalizeAgentKind(value: unknown): AgentKind | null {
  return value === 'annotation' || value === 'review' ? value : null;
}

export function normalizeProviderType(value: unknown): ProviderType | null {
  if (value === 'openai') return 'openai-chat';
  return value === 'openai-chat' ||
    value === 'openai-responses' ||
    value === 'anthropic' ||
    value === 'gemini'
    ? value
    : null;
}

export function normalizeProviderModelInputMode(value: unknown) {
  return value === 'custom' || value === 'list' ? value : null;
}

export function normalizePresetId(value: unknown): ProviderPresetId | undefined {
  return providerPresets.some((preset) => preset.id === value)
    ? (value as ProviderPresetId)
    : undefined;
}

export function normalizeModelNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = Array.from(
    new Set(
      value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()),
    ),
  ).filter(Boolean);
  return names.length > 0 ? names : undefined;
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  return value === 'default' ||
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'auto'
    ? value
    : undefined;
}

export function normalizeTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.5;
  return Math.min(1, Math.max(0, temperature));
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
