import {
  ARTICLE_SOURCE_TYPES,
  assistantExecutionModes,
  assistantExecutionStatuses,
  assistantExecutionTaskTypes,
  assistantRuntimeTaskTypes,
  defaultLibraryContentSourceOrder,
  type Agent,
  type AgentMentionInstructionPayload,
  type AgentReviewPayload,
  type Annotation,
  type AppSettingsPatch,
  type Comment,
  type LlmProvider,
  type ReaderChatState,
  type UserProfile,
} from '@yomitomo/shared';
import { z } from 'zod';
import { avatarSchema } from '../ipc-avatar-schema';

const idSchema = z.string().min(1).max(256);
const timestampSchema = z.string().min(1).max(128);
const boundedStringSchema = z.string().max(100_000);
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const positivePageSchema = z.number().int().positive().max(10_000);
const pageSizeSchema = z.number().int().positive().max(500);

const textAnchorShapeSchema = z.object({
  exact: boundedStringSchema,
  prefix: boundedStringSchema,
  suffix: boundedStringSchema,
  start: nonnegativeIntegerSchema,
  end: nonnegativeIntegerSchema,
  paragraphId: idSchema.optional(),
  chapterId: idSchema.optional(),
  segmentId: idSchema.optional(),
  textStartInParagraph: nonnegativeIntegerSchema.optional(),
  textEndInParagraph: nonnegativeIntegerSchema.optional(),
  textStartInBook: nonnegativeIntegerSchema.optional(),
  textEndInBook: nonnegativeIntegerSchema.optional(),
  quoteHash: z.string().max(256).optional(),
});

const pdfRatioSchema = z.number().min(0).max(1);
const annotationAnchorSchema = z.discriminatedUnion('kind', [
  textAnchorShapeSchema.extend({ kind: z.undefined().optional() }),
  textAnchorShapeSchema.extend({
    kind: z.literal('pdf-text'),
    pageIndex: nonnegativeIntegerSchema,
    pageWidth: z.number().positive().max(Number.MAX_SAFE_INTEGER),
    pageHeight: z.number().positive().max(Number.MAX_SAFE_INTEGER),
    rects: z
      .array(
        z.object({
          x: pdfRatioSchema,
          y: pdfRatioSchema,
          width: pdfRatioSchema,
          height: pdfRatioSchema,
        }),
      )
      .max(4096),
  }),
]);

const annotationAuthorShapeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agent'),
    agentId: idSchema,
    username: z.string().min(1).max(256),
    nickname: z.string().max(256).optional(),
    avatar: avatarSchema.optional(),
    annotationColor: z.string().max(128).optional(),
  }),
  z.object({
    kind: z.literal('user'),
    userId: idSchema.optional(),
    username: z.string().min(1).max(256),
    nickname: z.string().max(256).optional(),
    avatar: avatarSchema.optional(),
    annotationColor: z.string().max(128).optional(),
  }),
]);

const assistantProgressShapeSchema = z.object({
  steps: z
    .array(
      z.object({
        id: idSchema,
        label: z.string().max(500),
        status: z.enum(['active', 'done', 'failed']),
      }),
    )
    .max(100),
  fallbackMessage: boundedStringSchema.optional(),
});

const commentShapeSchema = z.object({
  id: idSchema,
  author: annotationAuthorShapeSchema,
  content: boundedStringSchema,
  createdAt: timestampSchema,
  replyTo: idSchema.optional(),
  readingIntent: z.enum(['explain', 'decompose', 'challenge', 'question', 'connect']).optional(),
  reviewLabel: z.enum(['站得住', '有洞察', '有异议', '待验证', '可深挖', '有遗漏']).optional(),
  pending: z.boolean().optional(),
  assistantProgress: assistantProgressShapeSchema.optional(),
});

const distillationShapeSchema = z.object({
  status: z.enum(['unpublished', 'published']),
  content: boundedStringSchema,
  publishedAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional(),
  reviewSessions: z.array(z.record(z.string(), z.unknown())).max(1_000).optional(),
});

const distillationSchema =
  checkedSchema<NonNullable<Annotation['distillation']>>(distillationShapeSchema);

const annotationShapeSchema = z.object({
  id: idSchema,
  anchor: annotationAnchorSchema.refine((anchor) => anchor.end >= anchor.start),
  author: annotationAuthorShapeSchema,
  annotationType: z.enum(['key_point', 'assumption', 'concept', 'question', 'quote']).optional(),
  moveType: z
    .enum([
      'explain_concept',
      'surface_assumption',
      'ask_question',
      'connect_previous',
      'challenge_argument',
      'reader_application',
      'style_observation',
      'structure_marker',
      'definition_watch',
      'foreshadowing_watch',
    ])
    .optional(),
  whyHere: boundedStringSchema.optional(),
  evidenceUsed: z
    .array(z.enum(['localText', 'chapterSummary', 'trace', 'relatedPassage']))
    .max(100)
    .optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  shouldShow: z.boolean().optional(),
  color: z.string().min(1).max(128),
  readingIntent: z.enum(['explain', 'decompose', 'challenge', 'question', 'connect']).optional(),
  comments: z.array(commentShapeSchema).max(10_000),
  distillation: distillationSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const agentShapeSchema = z.object({
  id: idSchema,
  kind: z.enum(['annotation', 'review']),
  presetId: idSchema.optional(),
  enabled: z.boolean(),
  providerId: idSchema,
  nickname: z.string().max(256),
  username: z.string().min(1).max(256),
  avatar: avatarSchema,
  annotationColor: z.string().max(128),
  annotationDensity: z.enum(['low', 'medium', 'high']),
  temperature: z.number().finite(),
  soul: boundedStringSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const publicAgentShapeSchema = agentShapeSchema
  .omit({
    providerId: true,
    soul: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    personalityName: z.string().max(256),
    pinyin: z.string().max(256).optional(),
  });

const readerProgressShapeSchema = z.object({
  currentChapterId: idSchema,
  currentSegmentId: idSchema.optional(),
  readChapterIds: z.array(idSchema).max(100_000),
  readUntilTextOffset: nonnegativeIntegerSchema.optional(),
});

const spoilerPolicyShapeSchema = z.object({
  allowedScope: z.enum([
    'current-selection',
    'current-segment',
    'current-chapter-so-far',
    'current-chapter',
    'read-so-far',
    'whole-book',
  ]),
  allowFutureChapterEvidence: z.boolean(),
  allowFuturePlotEvents: z.boolean(),
  userOverride: z.boolean().optional(),
});

const ebookIndexShapeSchema = z.object({
  version: z.literal(1),
  articleId: idSchema,
  textLength: nonnegativeIntegerSchema,
  chapters: z.array(z.record(z.string(), z.unknown())).max(100_000),
  segments: z.array(z.record(z.string(), z.unknown())).max(100_000),
  paragraphs: z.array(z.record(z.string(), z.unknown())).max(1_000_000),
});

const articleContextShapeSchema = z.object({
  id: idSchema.optional(),
  title: z.string().max(10_000),
  url: z.string().max(4096),
  text: z.string().max(20_000_000),
  ebookIndex: ebookIndexShapeSchema.optional(),
});

const agentReviewPayloadShapeSchema = z.object({
  agentId: idSchema.optional(),
  agentUsername: z.string().min(1).max(256),
  uiLanguage: z.enum(['zh-CN', 'en', 'ja']).optional(),
  agentRoster: z.array(publicAgentShapeSchema).max(1_000).optional(),
  readerProgress: readerProgressShapeSchema.optional(),
  spoilerPolicy: spoilerPolicyShapeSchema.optional(),
  article: articleContextShapeSchema,
  annotation: annotationShapeSchema,
});

const agentMentionPayloadShapeSchema = z.object({
  note: boundedStringSchema,
  targetAnchor: textAnchorShapeSchema.optional(),
  targetSection: z
    .object({
      sectionId: idSchema.optional(),
      sectionTitle: z.string().max(10_000).optional(),
      text: boundedStringSchema,
    })
    .optional(),
  allowedActions: z
    .array(z.enum(['comment', 'create_thought']))
    .max(2)
    .optional(),
  agents: z.array(publicAgentShapeSchema).max(1_000),
  article: articleContextShapeSchema.omit({ id: true, ebookIndex: true }),
});

const annotationSchema = checkedSchema<Annotation>(annotationShapeSchema);
const commentSchema = checkedSchema<Comment>(commentShapeSchema);
const agentReviewPayloadSchema = checkedSchema<AgentReviewPayload>(agentReviewPayloadShapeSchema);
const agentMentionPayloadSchema = checkedSchema<AgentMentionInstructionPayload>(
  agentMentionPayloadShapeSchema,
);

const sourceRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

const annotationWindowOpenSchema = z.object({
  articleId: idSchema,
  annotationId: idSchema,
  sourceRect: sourceRectSchema.optional(),
});

const providerTypeSchema = z.enum(['openai-chat', 'openai-responses', 'anthropic', 'gemini']);
const providerPresetIdSchema = z.enum([
  'dashscope',
  'deepseek',
  'moonshot',
  'zhipu',
  'doubao',
  'mimo',
  'openai',
  'anthropic',
  'gemini',
]);
const reasoningEffortSchema = z.enum([
  'default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'auto',
]);
const providerShapeSchema = z.object({
  id: idSchema,
  name: z.string().max(256),
  type: providerTypeSchema,
  presetId: providerPresetIdSchema.optional(),
  logo: z.string().max(4096).optional(),
  baseUrl: z.string().max(4096),
  apiKey: z.string().max(16_384),
  hasApiKey: z.boolean().optional(),
  modelName: z.string().max(512),
  modelNames: z.array(z.string().max(512)).max(10_000).optional(),
  modelInputMode: z.enum(['list', 'custom']).optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const providerPatchSchema = checkedSchema<Partial<LlmProvider>>(providerShapeSchema.partial());
const settingsSchema = checkedSchema<AppSettingsPatch>(
  z.object({
    uiLanguage: z.enum(['zh-CN', 'en', 'ja']).optional(),
    themeId: idSchema.optional(),
    soundEffectsEnabled: z.boolean().optional(),
    soundEffectsVolume: z.number().min(0).max(1).optional(),
    appLockEnabled: z.boolean().optional(),
    appLockLocked: z.boolean().optional(),
    appLockLockOnStartup: z.boolean().optional(),
    appLockShortcut: z.string().max(80).optional(),
    libraryPageSize: z
      .union([z.literal(6), z.literal(12), z.literal(18), z.literal(24)])
      .optional(),
    libraryContentSources: z
      .array(
        z.object({
          id: z.enum(defaultLibraryContentSourceOrder),
          enabled: z.boolean(),
        }),
      )
      .max(defaultLibraryContentSourceOrder.length)
      .optional(),
    defaultProviderId: idSchema.optional(),
    readingAssistantProviderId: idSchema.optional(),
    reviewAssistantProviderId: idSchema.optional(),
    bilingualTranslationProviderId: idSchema.optional(),
    bilingualTranslationTargetLanguage: z.string().max(80).optional(),
    bilingualTranslationStyle: z
      .enum(['blur', 'blockquote', 'weakened', 'dashedLine', 'border'])
      .optional(),
    bilingualTranslationAiContextAware: z.boolean().optional(),
    assistantExecutionMode: z.enum(assistantExecutionModes).optional(),
    messageSendShortcut: z.enum(['enter', 'mod-enter']).optional(),
    selectionActionShortcuts: z
      .object({
        copy: z.string().max(80).optional(),
        annotate: z.string().max(80).optional(),
        ask: z.string().max(80).optional(),
      })
      .optional(),
    saveArticleImages: z.boolean().optional(),
    allowLocalNetworkArticleImport: z.boolean().optional(),
    readingMemoryRemoteConsent: z.boolean().optional(),
    telemetryEnabled: z.boolean().optional(),
    developerModeEnabled: z.boolean().optional(),
    logRetentionDays: z.union([z.literal(15), z.literal(30), z.literal(90)]).optional(),
    onboardingCompletedAt: timestampSchema.optional(),
    lastSeenVersion: z.string().max(128).optional(),
  }),
);

const userPatchSchema = checkedSchema<Partial<UserProfile>>(
  z.object({
    id: idSchema.optional(),
    nickname: z.string().max(256).optional(),
    username: z.string().max(256).optional(),
    avatar: avatarSchema.optional(),
    annotationColor: z.string().max(128).optional(),
    updatedAt: timestampSchema.optional(),
  }),
);

const assistantExecutionQuerySchema = z.object({
  from: timestampSchema,
  to: timestampSchema,
  agentId: idSchema.optional(),
  providerId: idSchema.optional(),
  modelName: z.string().max(512).optional(),
  taskType: z.enum(assistantExecutionTaskTypes).optional(),
  status: z.union([z.enum(assistantExecutionStatuses), z.literal('all')]).optional(),
  requestedMode: z.enum(assistantExecutionModes).optional(),
  effectiveMode: z.enum(assistantExecutionModes).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
});

const articleReadingProgressSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('scroll'),
    progress: z.number().min(0).max(1),
    updatedAt: timestampSchema,
  }),
  z.object({
    kind: z.literal('page'),
    pageIndex: nonnegativeIntegerSchema,
    pageCount: z.number().int().positive(),
    updatedAt: timestampSchema,
  }),
  z.object({
    kind: z.literal('chapter'),
    chapterIndex: nonnegativeIntegerSchema,
    chapterProgress: z.number().min(0).max(1),
    bookProgress: z.number().min(0).max(1),
    updatedAt: timestampSchema,
  }),
]);

const readerChatStateShapeSchema = z.object({
  articleId: idSchema,
  activeSessionId: idSchema,
  selectedAssistantId: idSchema.optional(),
  sessions: z
    .array(
      z.object({
        id: idSchema,
        articleId: idSchema,
        title: z.string().max(10_000).optional(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema,
        messages: z
          .array(
            z.object({
              id: idSchema,
              role: z.enum(['user', 'assistant']),
              content: boundedStringSchema,
              assistantId: idSchema.optional(),
              context: z.record(z.string(), z.unknown()).optional(),
              createdAt: timestampSchema,
            }),
          )
          .max(100_000),
      }),
    )
    .max(10_000),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const readerChatStateSchema = checkedSchema<ReaderChatState>(readerChatStateShapeSchema);

type AnnotationSedimentationCommitSchemaInput = {
  articleId: string;
  annotationId: string;
  distillation: Annotation['distillation'];
  transition: 'publish' | 'update' | 'unpublish';
};

type ArticleAnnotationDistillationSaveSchemaInput = {
  articleId: string;
  annotationId: string;
  distillation: Annotation['distillation'];
  expectedDistillationUpdatedAt: string | null;
  updatedAt?: string;
};

export const agentDomainIpcInvokeSchemas = {
  'agent:delete': z.tuple([idSchema]),
  'agent:mention-route': z.tuple([agentMentionPayloadSchema]),
  'agent:review': z.tuple([agentReviewPayloadSchema]),
  'agent:save': z.tuple([checkedSchema<Partial<Agent>>(agentShapeSchema.partial())]),
  'agent-trace:list': z.tuple([
    z
      .object({
        taskType: z.union([z.enum(assistantRuntimeTaskTypes), z.literal('all')]).optional(),
        agentId: idSchema.optional(),
        articleId: idSchema.optional(),
        failureOnly: z.boolean().optional(),
        limit: z.number().int().positive().max(10_000).optional(),
      })
      .optional(),
  ]),
  'assistant-executions:list': z.tuple([assistantExecutionQuerySchema]),
  'assistant-executions:detail': z.tuple([idSchema]),
  'assistant-executions:summary': z.tuple([assistantExecutionQuerySchema]),
};

export const annotationWindowDomainIpcInvokeSchemas = {
  'annotation-discussion:open': z.tuple([
    annotationWindowOpenSchema.extend({
      thoughtDraft: z.string().max(8_192).trim().min(1).optional(),
    }),
  ]),
  'annotation-discussion:close-article': z.tuple([z.object({ articleId: idSchema })]),
  'annotation-sedimentation:open': z.tuple([annotationWindowOpenSchema]),
  'annotation-sedimentation:commit': z.tuple([
    checkedSchema<AnnotationSedimentationCommitSchemaInput>(
      z
        .object({
          articleId: idSchema,
          annotationId: idSchema,
          distillation: distillationSchema.optional(),
          transition: z.enum(['publish', 'update', 'unpublish']),
        })
        .refine((input) => Object.hasOwn(input, 'distillation')),
    ),
  ]),
};

export const appDomainIpcInvokeSchemas = {
  'performance:timing': z.tuple([
    z.object({
      event: z.string().min(1).max(256),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
  ]),
  'url:open': z.tuple([z.string().min(1).max(4096)]),
};

export const articleDomainIpcInvokeSchemas = {
  'article:delete': z.tuple([idSchema]),
  'article:delete-annotation': z.tuple([z.object({ articleId: idSchema, annotationId: idSchema })]),
  'article:delete-comment': z.tuple([
    z.object({ articleId: idSchema, annotationId: idSchema, commentId: idSchema }),
  ]),
  'article:merge-agent-annotation': z.tuple([
    z.object({ articleId: idSchema, annotation: annotationSchema }),
  ]),
  'article:save-annotation': z.tuple([
    z.object({
      articleId: idSchema,
      annotation: annotationSchema,
      updatedAt: timestampSchema.optional(),
    }),
  ]),
  'article:save-annotation-distillation': z.tuple([
    checkedSchema<ArticleAnnotationDistillationSaveSchemaInput>(
      z
        .object({
          articleId: idSchema,
          annotationId: idSchema,
          distillation: distillationSchema.optional(),
          expectedDistillationUpdatedAt: timestampSchema.nullable(),
          updatedAt: timestampSchema.optional(),
        })
        .refine((input) => Object.hasOwn(input, 'distillation')),
    ),
  ]),
  'article:save-comment': z.tuple([
    z.object({
      articleId: idSchema,
      annotationId: idSchema,
      comment: commentSchema,
      updatedAt: timestampSchema.optional(),
    }),
  ]),
  'article:get': z.tuple([idSchema]),
  'article:get-cover': z.tuple([idSchema]),
  'article:get-site-icon': z.tuple([idSchema]),
  'article:list-library': z.tuple([
    z.object({
      source: z.enum(ARTICLE_SOURCE_TYPES),
      query: z.string().max(500).optional(),
      page: positivePageSchema.optional(),
      pageSize: pageSizeSchema.optional(),
    }),
  ]),
  'article:reading-progress': z.tuple([
    z.object({ articleId: idSchema, progress: articleReadingProgressSchema }),
  ]),
  'article:reader-chat-state': z.tuple([
    z.object({ articleId: idSchema, readerChatState: readerChatStateSchema.optional() }),
  ]),
};

export const libraryDomainIpcInvokeSchemas = {
  'library-catalog:list': z.tuple([
    z.object({
      scope: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('library') }),
        z.object({ kind: z.literal('collection'), collectionId: idSchema }),
        z.object({ kind: z.literal('picker'), collectionId: idSchema }),
      ]),
      types: z
        .array(z.enum([...ARTICLE_SOURCE_TYPES, 'weread', 'collection']))
        .max(6)
        .optional(),
      query: z.string().max(500).optional(),
      page: positivePageSchema.optional(),
      pageSize: pageSizeSchema.optional(),
    }),
  ]),
};

export const providerDomainIpcInvokeSchemas = {
  'provider:delete': z.tuple([idSchema]),
  'provider:list-models': z.tuple([providerPatchSchema]),
  'provider:read-api-key': z.tuple([idSchema]),
  'provider:save': z.tuple([
    checkedSchema<Partial<LlmProvider> & { removeApiKey?: boolean }>(
      providerShapeSchema.partial().extend({ removeApiKey: z.boolean().optional() }),
    ),
  ]),
  'provider:test': z.tuple([providerPatchSchema]),
  'settings:save': z.tuple([settingsSchema]),
  'user:save': z.tuple([userPatchSchema]),
};

export const updateDomainIpcInvokeSchemas = {
  'updates:simulate-available': z.tuple([z.enum(['manual', 'auto']).optional()]),
  'release-notes:get': z.tuple([
    z.object({
      version: z.string().min(1).max(128),
      source: z.enum(['local', 'remote']),
      language: z.enum(['zh-CN', 'en', 'ja']).optional(),
    }),
  ]),
};

function checkedSchema<Type>(schema: z.ZodType): z.ZodType<Type> {
  return schema as z.ZodType<Type>;
}
