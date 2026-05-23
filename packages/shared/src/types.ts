export type AnnotationAuthor = 'user' | 'ai';

export type ProviderType = 'openai-chat' | 'openai-responses' | 'anthropic' | 'gemini';

export type ProviderPresetId =
  | 'dashscope'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'doubao'
  | 'mimo'
  | 'openai'
  | 'anthropic'
  | 'gemini';

export type ReasoningEffort =
  | 'default'
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'auto';

export type ProviderPreset = {
  id: ProviderPresetId;
  name: string;
  type: ProviderType;
  baseUrl: string;
  modelName: string;
  logo: string;
  modelNames: string[];
};

export type ProviderModel = {
  id: string;
  name: string;
};

export type AnnotationType = 'key_point' | 'assumption' | 'concept' | 'question' | 'quote';

export type AnnotationMove =
  | 'explain_concept'
  | 'surface_assumption'
  | 'ask_question'
  | 'connect_previous'
  | 'challenge_argument'
  | 'reader_application'
  | 'style_observation'
  | 'structure_marker'
  | 'definition_watch'
  | 'foreshadowing_watch';

export type AnnotationEvidenceSource = 'localText' | 'chapterSummary' | 'trace' | 'relatedPassage';

export type AnnotationConfidence = 'low' | 'medium' | 'high';

export type AgentAnnotationDensity = 'low' | 'medium' | 'high';

export type AgentReadingIntent = 'explain' | 'decompose' | 'challenge' | 'question' | 'connect';

export type AgentKind = 'annotation' | 'review';

export type ReviewOpinionLabel = '站得住' | '有洞察' | '有异议' | '待验证' | '可深挖' | '有遗漏';

export type ProviderModelInputMode = 'list' | 'custom';

export type MessageSendShortcut = 'enter' | 'mod-enter';

export type SelectionActionShortcuts = {
  copy: string;
  annotate: string;
};

export type AgentPersonality = {
  id: string;
  kind: AgentKind;
  name: string;
  pinyin?: string;
  roleTitle: string;
  gender: 'female' | 'male';
  description: string;
  introduction: string;
  selfIntroduction?: string;
  sceneDescription: string;
  portraitPrompt: string;
  scenePrompt: string;
  icon: 'leaf' | 'pyramid' | 'question' | 'quill' | 'lens' | 'scales' | 'checklist';
  temperature: number;
  defaultColor: string;
  defaultEnabled: boolean;
  soul: string;
};

export type LlmProvider = {
  id: string;
  name: string;
  type: ProviderType;
  presetId?: ProviderPresetId;
  logo?: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey?: boolean;
  modelName: string;
  modelNames?: string[];
  modelInputMode?: ProviderModelInputMode;
  reasoningEffort?: ReasoningEffort;
  createdAt: string;
  updatedAt: string;
};

export type Agent = {
  id: string;
  kind: AgentKind;
  presetId?: string;
  enabled: boolean;
  providerId: string;
  nickname: string;
  username: string;
  avatar: string;
  annotationColor: string;
  annotationDensity: AgentAnnotationDensity;
  temperature: number;
  soul: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicAgent = Omit<Agent, 'providerId' | 'soul' | 'createdAt' | 'updatedAt'> & {
  personalityName: string;
  pinyin?: string;
};

export type UserProfile = {
  id: string;
  nickname: string;
  username: string;
  avatar: string;
  annotationColor: string;
  updatedAt: string;
};

export type TextAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  paragraphId?: string;
  chapterId?: string;
  segmentId?: string;
  textStartInParagraph?: number;
  textEndInParagraph?: number;
  textStartInBook?: number;
  textEndInBook?: number;
  quoteHash?: string;
};

export type PdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfTextAnchor = TextAnchor & {
  kind: 'pdf-text';
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rects: PdfRect[];
};

export type Comment = {
  id: string;
  author: AnnotationAuthor;
  content: string;
  createdAt: string;
  replyTo?: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  readingIntent?: AgentReadingIntent;
  reviewLabel?: ReviewOpinionLabel;
  pending?: boolean;
};

export type Annotation = {
  id: string;
  anchor: TextAnchor;
  author: AnnotationAuthor;
  annotationType?: AnnotationType;
  moveType?: AnnotationMove;
  whyHere?: string;
  evidenceUsed?: AnnotationEvidenceSource[];
  confidence?: AnnotationConfidence;
  shouldShow?: boolean;
  color: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  readingIntent?: AgentReadingIntent;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleSourceType = 'web' | 'ebook' | 'pdf';

export type EbookFormat = 'epub';

export type EbookMetadata = {
  format: EbookFormat;
  fileName: string;
  fileSize: number;
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

export type PdfMetadata = {
  format: 'pdf';
  fileName: string;
  fileSize: number;
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
};

export type PdfRecord = {
  metadata: PdfMetadata;
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

export type SpoilerAllowedScope =
  | 'current-selection'
  | 'current-segment'
  | 'current-chapter-so-far'
  | 'current-chapter'
  | 'read-so-far'
  | 'whole-book';

export type SpoilerPolicy = {
  allowedScope: SpoilerAllowedScope;
  allowFutureChapterEvidence: boolean;
  allowFuturePlotEvents: boolean;
  userOverride?: boolean;
};

export type ReaderProgress = {
  currentChapterId: string;
  currentSegmentId?: string;
  readChapterIds: string[];
  readUntilTextOffset?: number;
};

export type ReadingContextTask =
  | 'selection_annotation'
  | 'selection_thread_reply'
  | 'chapter_route'
  | 'chapter_segment_annotation';

export type ContextSourceType =
  | 'article_text'
  | 'selection'
  | 'local_window'
  | 'nearby_annotation'
  | 'thread'
  | 'retrieved_evidence'
  | 'toc'
  | 'agent_role'
  | 'reader_goal'
  | 'segment'
  | 'chapter_memory'
  | 'segment_memory'
  | 'segment_trace'
  | 'next_preview'
  | 'chapter_trace'
  | 'dedup';

export type ContextSourceLabel = {
  type: ContextSourceType;
  articleId?: string;
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  score?: number;
  source?: string;
};

export type RelatedPassageSource =
  | 'none'
  | 'local-window'
  | 'current-chapter-lexical'
  | 'chapter-trace';

export type SourceLabeledContextBlock = {
  id: string;
  text: string;
  source: ContextSourceLabel;
};

export type BudgetPolicy = {
  maxTokens: number;
  blockTypeOrder?: ContextSourceType[];
  reserveTokensByType?: Partial<Record<ContextSourceType, number>>;
};

export type EvidencePolicy = {
  spoilerPolicy: SpoilerPolicy;
  allowedSourceTypes?: ContextSourceType[];
};

export type TextRange = {
  textStart: number;
  textEnd: number;
};

export type TextSummaryScope = 'segment' | 'chapter' | 'book';

export type TextSummary = {
  scope: TextSummaryScope;
  sourceRange: TextRange;
  chapterId?: string;
  segmentId?: string;
  summary: string;
  keyTerms: string[];
  updatedAt: string;
};

export type TraceItemType =
  | 'claim'
  | 'question'
  | 'agent_observation'
  | 'reader_interest'
  | 'cross_reference_candidate';

export type TraceItem = {
  type: TraceItemType;
  content: string;
  evidenceAnchors: TextAnchor[];
  agentId?: string;
  confidence: AnnotationConfidence;
  createdFromTask: string;
};

export type ReadingTraceScope = 'segment' | 'chapter' | 'agent' | 'reader';

export type ReadingTrace = {
  scope: ReadingTraceScope;
  sourceRange?: TextRange;
  chapterId?: string;
  segmentId?: string;
  agentId?: string;
  items: TraceItem[];
  updatedAt: string;
};

export type ReadingMemory = {
  textSummaries: TextSummary[];
  readingTraces: ReadingTrace[];
  updatedAt: string;
};

export type BookContext = {
  articleId: string;
  title: string;
  url?: string;
  sourceType?: ArticleSourceType;
  textLength?: number;
  ebookIndex?: EpubBookIndex;
};

export type LocationContext = {
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  textRange?: TextRange;
  readerProgress?: ReaderProgress;
};

export type AgentContext = {
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  readingIntent?: AgentReadingIntent;
};

export type BaseReadingContext = {
  book: BookContext;
  location: LocationContext;
  agent?: AgentContext;
  budget: BudgetPolicy;
  evidencePolicy: EvidencePolicy;
};

export type ParagraphWindow = {
  anchor?: TextAnchor;
  blocks: SourceLabeledContextBlock[];
};

export type AnnotationSummary = {
  annotationId: string;
  anchor?: TextAnchor;
  text: string;
  source: ContextSourceLabel;
};

export type ThreadMessageContext = {
  commentId: string;
  author: AnnotationAuthor;
  text: string;
  source: ContextSourceLabel;
};

export type ThreadContext = {
  annotationId: string;
  messages: ThreadMessageContext[];
};

export type RelatedPassage = {
  id: string;
  text: string;
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  reason?: string;
  passageSource?: RelatedPassageSource;
  score?: number;
  anchor?: TextAnchor;
  source: ContextSourceLabel;
};

export type RelatedPassageInput = {
  id?: string;
  title?: string;
  text: string;
  textStart?: number;
  textEnd?: number;
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  source?: RelatedPassageSource;
  reason?: string;
  score?: number;
  anchor?: TextAnchor;
};

export type ChapterDescriptor = {
  chapterId: string;
  title: string;
  indexInBook: number;
  textLength: number;
  segmentCount?: number;
  previewStart?: string;
  previewEnd?: string;
  existingSummary?: string;
  source: ContextSourceLabel;
};

export type AgentRoleCard = {
  agentId: string;
  agentUsername: string;
  nickname: string;
  roleCard: string;
  source: ContextSourceLabel;
};

export type ChapterMemory = {
  chapterId: string;
  summary: string;
  source: ContextSourceLabel;
};

export type SegmentText = {
  segmentId: string;
  text: string;
  textRange?: TextRange;
  source: ContextSourceLabel;
};

export type SegmentMemory = {
  segmentId: string;
  summary: string;
  source: ContextSourceLabel;
};

export type ChapterTrace = {
  chapterId: string;
  events: string[];
  source: ContextSourceLabel;
};

export type SegmentTraceMemory = {
  segmentId: string;
  events: string[];
  source: ContextSourceLabel;
};

export type DedupContext = {
  recentAnchors: TextAnchor[];
  recentComments?: string[];
  source: ContextSourceLabel;
};

export type SelectionAnnotationContext = BaseReadingContext & {
  task: 'selection_annotation';
  selection: TextAnchor;
  localWindow: ParagraphWindow;
  nearbyAnnotations: AnnotationSummary[];
  retrievedEvidence: RelatedPassage[];
  chapterMemory?: ChapterMemory;
};

export type SelectionThreadContext = BaseReadingContext & {
  task: 'selection_thread_reply';
  originalSelection: TextAnchor;
  thread: ThreadContext;
  localWindow: ParagraphWindow;
  retrievedEvidence: RelatedPassage[];
};

export type ChapterRouteContext = BaseReadingContext & {
  task: 'chapter_route';
  toc: ChapterDescriptor[];
  readerGoal?: string;
  agents: AgentRoleCard[];
};

export type SegmentAnnotationContext = BaseReadingContext & {
  task: 'chapter_segment_annotation';
  currentSegment: SegmentText;
  retrievedEvidence: RelatedPassage[];
  previousMemory?: SegmentMemory;
  previousTrace?: SegmentTraceMemory;
  nextPreview?: string;
  chapterTrace?: ChapterTrace;
  allowedAnchorRange: TextRange;
  dedupContext: DedupContext;
};

export type ReadingTaskContext =
  | SelectionAnnotationContext
  | SelectionThreadContext
  | ChapterRouteContext
  | SegmentAnnotationContext;

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

export type AppSettings = {
  defaultProviderId?: string;
  readingAssistantProviderId?: string;
  reviewAssistantProviderId?: string;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  saveArticleImages?: boolean;
  logRetentionDays?: number;
  onboardingCompletedAt?: string;
};

export type DesktopStore = {
  user: UserProfile;
  settings: AppSettings;
  providers: LlmProvider[];
  agents: Agent[];
  articles: ArticleSummaryRecord[];
};

export type AgentMessagePayload = {
  agentId?: string;
  agentUsername: string;
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  reviewTargetCommentId?: string;
  agentRoster?: PublicAgent[];
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
  article: {
    title: string;
    url: string;
    text: string;
    ebookIndex?: EpubBookIndex;
  };
  annotation: Annotation;
  userComment: Comment;
};

export type AgentReviewPayload = {
  agentId?: string;
  agentUsername: string;
  agentRoster?: PublicAgent[];
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
  article: {
    title: string;
    url: string;
    text: string;
    ebookIndex?: EpubBookIndex;
  };
  annotation: Annotation;
};

export type AgentAnnotatePayload = {
  agentId?: string;
  agentUsername: string;
  annotationType?: AnnotationType;
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  annotations?: Annotation[];
  readingMemory?: ReadingMemory;
  readingPlan?: AgentReadingPlanItem[];
  targetAnchor?: TextAnchor;
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
  article: {
    title: string;
    url: string;
    text: string;
    ebookIndex?: EpubBookIndex;
  };
};

export type AgentAnnotateResult = {
  annotations: Annotation[];
  readingMemory?: ReadingMemory;
};

export type FocusCoReadingRouteSectionInput = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
};

export type FocusCoReadingRouteChapterSummaryInput = {
  chapterId?: string;
  sectionId?: string;
  summary?: string;
  tag?: string;
};

export type FocusCoReadingRoutePayload = {
  selectedAgentIds: string[];
  sections: FocusCoReadingRouteSectionInput[];
  chapterSummaries?: FocusCoReadingRouteChapterSummaryInput[];
  readerGoal?: string;
  article: {
    title: string;
    url: string;
    byline?: string;
    text: string;
    ebookIndex?: EpubBookIndex;
    ebookMetadata?: EbookMetadata;
  };
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
};

export type FocusCoReadingRouteSection = {
  sectionId: string;
  summary?: string;
  tag?: string;
  targetDensity?: AgentAnnotationDensity;
  needsFurtherPlanning?: boolean;
  agentIds: string[];
};

export type FocusCoReadingRouteResult = {
  sections: FocusCoReadingRouteSection[];
};

export type AnnotationMetadataPayload = {
  article: {
    title: string;
    url: string;
    text: string;
  };
  anchor: TextAnchor;
  note: string;
};

export type AnnotationMetadata = {
  annotationType: AnnotationType;
  readingIntent: AgentReadingIntent;
};

export type AgentReadingPlanItem = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  readingIntent?: AgentReadingIntent;
  sectionSummary?: string;
  sectionTag?: string;
  targetDensity?: AgentAnnotationDensity;
  messages?: AgentReadingPlanMessage[];
};

export type AgentReadingPlanMessage = {
  content: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentIds?: string[];
  agentUsernames?: string[];
  agentNicknames?: string[];
};

export type AgentMentionInstructionPayload = {
  note: string;
  targetAnchor?: TextAnchor;
  targetSection?: {
    sectionId?: string;
    sectionTitle?: string;
    text: string;
  };
  allowedActions?: AgentMentionAction[];
  agents: PublicAgent[];
  article: {
    title: string;
    url: string;
    text: string;
  };
};

export type AgentMentionAction = 'comment' | 'create_thought';

export type AgentMentionDirective = {
  agentId?: string;
  agentUsername: string;
  action: AgentMentionAction;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
};

export type AgentMentionRoutePlan = {
  createUserThought: boolean;
  directives: AgentMentionDirective[];
};

export type AgentMentionInstruction = AgentMentionDirective;
