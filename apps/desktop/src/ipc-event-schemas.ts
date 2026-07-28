import { z } from 'zod';
import { isRecord } from '@yomitomo/shared';
import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamRequest,
  DesktopIpcToMainEventArgs,
  DesktopIpcToMainEventChannel,
} from './ipc-contract';
import { desktopIpcInvalidArgsError } from './ipc-schemas';
import {
  isDesktopIpcStreamRequestId,
  MAX_DESKTOP_IPC_STREAM_REQUEST_ID_LENGTH,
} from './ipc-stream-channel';

const MAX_ID_LENGTH = 256;
const MAX_SHORT_TEXT_LENGTH = 100_000;
const MAX_ARTICLE_TEXT_LENGTH = 20_000_000;
const MAX_LIST_LENGTH = 500;
const MAX_ROSTER_LENGTH = 100;
const MAX_INDEX_LIST_LENGTH = 100_000;
const MAX_PAYLOAD_DEPTH = 16;
const MAX_PAYLOAD_NODES = 200_000;
const MAX_OBJECT_KEYS = 500;

const idSchema = z.string().min(1).max(MAX_ID_LENGTH);
const optionalIdSchema = idSchema.optional();
const shortTextSchema = z.string().max(MAX_SHORT_TEXT_LENGTH);
const optionalShortTextSchema = shortTextSchema.optional();
const articleTextSchema = z.string().max(MAX_ARTICLE_TEXT_LENGTH);
const offsetSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestampSchema = z.string().max(64);
const requestIdSchema = z
  .string()
  .min(1)
  .max(MAX_DESKTOP_IPC_STREAM_REQUEST_ID_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const readingIntentSchema = z.enum(['explain', 'decompose', 'challenge', 'question', 'connect']);
const annotationAuthorIdentitySchema = {
  username: idSchema,
  nickname: optionalShortTextSchema,
  avatar: z.string().max(4096).optional(),
  annotationColor: z.string().max(128).optional(),
};
const annotationAuthorSchema = z.discriminatedUnion('kind', [
  z.looseObject({
    ...annotationAuthorIdentitySchema,
    kind: z.literal('agent'),
    agentId: idSchema,
  }),
  z.looseObject({
    ...annotationAuthorIdentitySchema,
    kind: z.literal('user'),
    userId: optionalIdSchema,
  }),
]);

const textAnchorSchema = z.looseObject({
  exact: shortTextSchema,
  prefix: shortTextSchema,
  suffix: shortTextSchema,
  start: offsetSchema,
  end: offsetSchema,
  paragraphId: optionalIdSchema,
  chapterId: optionalIdSchema,
  segmentId: optionalIdSchema,
  textStartInParagraph: offsetSchema.optional(),
  textEndInParagraph: offsetSchema.optional(),
  textStartInBook: offsetSchema.optional(),
  textEndInBook: offsetSchema.optional(),
  quoteHash: optionalIdSchema,
});

const commentSchema = z.looseObject({
  id: idSchema,
  author: annotationAuthorSchema,
  content: articleTextSchema,
  createdAt: timestampSchema,
  replyTo: optionalIdSchema,
  readingIntent: readingIntentSchema.optional(),
  pending: z.boolean().optional(),
});

const annotationSchema = z.looseObject({
  id: idSchema,
  anchor: textAnchorSchema,
  author: annotationAuthorSchema,
  annotationType: z.enum(['key_point', 'assumption', 'concept', 'question', 'quote']).optional(),
  color: z.string().max(128),
  readingIntent: readingIntentSchema.optional(),
  comments: z.array(commentSchema).max(MAX_LIST_LENGTH),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const epubIndexTextEntryBase = {
  id: idSchema,
  textStart: offsetSchema,
  textEnd: offsetSchema,
  textLength: offsetSchema,
  previewStart: shortTextSchema,
  previewEnd: shortTextSchema,
};
const epubIndexSchema = z.looseObject({
  version: z.literal(1),
  articleId: idSchema,
  textLength: offsetSchema,
  chapters: z
    .array(
      z.looseObject({
        ...epubIndexTextEntryBase,
        title: shortTextSchema,
        indexInBook: offsetSchema,
        href: z.string().max(4096).optional(),
        segmentIds: z.array(idSchema).max(MAX_INDEX_LIST_LENGTH),
        paragraphIds: z.array(idSchema).max(MAX_INDEX_LIST_LENGTH),
      }),
    )
    .max(MAX_INDEX_LIST_LENGTH),
  segments: z
    .array(
      z.looseObject({
        ...epubIndexTextEntryBase,
        chapterId: idSchema,
        indexInChapter: offsetSchema,
        paragraphIds: z.array(idSchema).max(MAX_INDEX_LIST_LENGTH),
      }),
    )
    .max(MAX_INDEX_LIST_LENGTH),
  paragraphs: z
    .array(
      z.looseObject({
        ...epubIndexTextEntryBase,
        chapterId: idSchema,
        segmentId: idSchema,
        indexInChapter: offsetSchema,
        indexInSegment: offsetSchema,
      }),
    )
    .max(MAX_INDEX_LIST_LENGTH),
});

const articleSchema = z.looseObject({
  id: optionalIdSchema,
  title: shortTextSchema,
  url: z.string().max(4096),
  text: articleTextSchema,
  ebookIndex: epubIndexSchema.optional(),
});

const readerProgressSchema = z.looseObject({
  currentChapterId: idSchema,
  currentSegmentId: optionalIdSchema,
  readChapterIds: z.array(idSchema).max(MAX_INDEX_LIST_LENGTH),
  readUntilTextOffset: offsetSchema.optional(),
});

const spoilerPolicySchema = z.looseObject({
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

const publicAgentSchema = z.looseObject({
  id: idSchema,
  kind: z.enum(['annotation', 'review']),
  enabled: z.boolean(),
  nickname: shortTextSchema,
  username: idSchema,
  avatar: z.string().max(4096),
  annotationColor: z.string().max(128),
  annotationDensity: z.enum(['low', 'medium', 'high']),
  temperature: z.number().finite(),
  personalityName: shortTextSchema,
});

const textRangeSchema = z.looseObject({
  textStart: offsetSchema,
  textEnd: offsetSchema,
});

const readingMemorySchema = z.looseObject({
  textSummaries: z
    .array(
      z.looseObject({
        scope: z.enum(['segment', 'chapter', 'book']),
        sourceRange: textRangeSchema,
        summary: articleTextSchema,
        keyTerms: z.array(shortTextSchema).max(MAX_LIST_LENGTH),
        updatedAt: timestampSchema,
      }),
    )
    .max(MAX_LIST_LENGTH),
  readingTraces: z
    .array(
      z.looseObject({
        scope: z.enum(['segment', 'chapter', 'agent', 'reader']),
        items: z.array(z.record(z.string().max(MAX_ID_LENGTH), z.unknown())).max(MAX_LIST_LENGTH),
        updatedAt: timestampSchema,
      }),
    )
    .max(MAX_LIST_LENGTH),
  updatedAt: timestampSchema,
});

const readingMemoryViewSchema = z.looseObject({
  articleId: idSchema,
  viewType: z.enum([
    'selection',
    'selection_thread',
    'article_section',
    'segment',
    'chapter',
    'agent',
    'legacy',
  ]),
  viewKey: idSchema,
  entries: z
    .array(
      z.looseObject({
        entry: z.record(z.string().max(MAX_ID_LENGTH), z.unknown()),
        source: z.enum(['structured', 'fts']),
        score: z.number().finite().optional(),
      }),
    )
    .max(MAX_LIST_LENGTH),
  sourceEntryIds: z.array(idSchema).max(MAX_LIST_LENGTH),
  updatedAt: timestampSchema,
});

const agentReadingPlanSchema = z
  .array(
    z.looseObject({
      sectionId: idSchema,
      sectionTitle: shortTextSchema,
      sectionStart: offsetSchema,
      sectionEnd: offsetSchema,
      readingIntent: readingIntentSchema.optional(),
      sectionSummary: optionalShortTextSchema,
      sectionTag: optionalShortTextSchema,
      targetDensity: z.enum(['low', 'medium', 'high']).optional(),
      messages: z
        .array(
          z.looseObject({
            content: shortTextSchema,
            agentId: optionalIdSchema,
            agentUsername: optionalIdSchema,
            agentIds: z.array(idSchema).max(MAX_ROSTER_LENGTH).optional(),
            agentUsernames: z.array(idSchema).max(MAX_ROSTER_LENGTH).optional(),
          }),
        )
        .max(MAX_ROSTER_LENGTH)
        .optional(),
    }),
  )
  .max(MAX_LIST_LENGTH);

const agentPayloadBase = {
  agentId: optionalIdSchema,
  agentUsername: idSchema,
  uiLanguage: z.enum(['zh-CN', 'en']).optional(),
  readingIntent: readingIntentSchema.optional(),
  instruction: optionalShortTextSchema,
  agentRoster: z.array(publicAgentSchema).max(MAX_ROSTER_LENGTH).optional(),
  readerProgress: readerProgressSchema.optional(),
  readingMemoryView: readingMemoryViewSchema.optional(),
  spoilerPolicy: spoilerPolicySchema.optional(),
  article: articleSchema,
};

const agentMessagePayloadSchema = boundedPayload(
  z.looseObject({
    ...agentPayloadBase,
    responseMode: z.enum(['thread_reply', 'create_thought', 'distillation_review']).optional(),
    distillationReviewMode: z.enum(['review', 'organize_discussion']).optional(),
    distillationDraft: articleTextSchema.optional(),
    distillationReviewRequest: articleTextSchema.optional(),
    distillationReviewTranscript: articleTextSchema.optional(),
    reviewTargetCommentId: optionalIdSchema,
    allowDisabledAgentForRule: z.boolean().optional(),
    annotation: annotationSchema,
    userComment: commentSchema,
  }),
);

const agentDistillationReviewPayloadSchema = agentMessagePayloadSchema.safeExtend({
  responseMode: z.literal('distillation_review').optional(),
  reviewMessageId: optionalIdSchema,
});

const agentAnnotatePayloadSchema = boundedPayload(
  z.looseObject({
    ...agentPayloadBase,
    annotationType: z.enum(['key_point', 'assumption', 'concept', 'question', 'quote']).optional(),
    annotations: z.array(annotationSchema).max(MAX_LIST_LENGTH).optional(),
    readingMemory: readingMemorySchema.optional(),
    readingPlan: agentReadingPlanSchema.optional(),
    targetAnchor: textAnchorSchema.optional(),
  }),
);

const desktopIpcStreamSchemas = {
  'agent:comment:stream': streamRequestSchema(agentMessagePayloadSchema),
  'agent:distillation-review:stream': streamRequestSchema(agentDistillationReviewPayloadSchema),
  'agent:annotate:stream': streamRequestSchema(agentAnnotatePayloadSchema),
} satisfies Record<DesktopIpcStreamChannel, z.ZodType>;

const streamCancelSchema = z.object({
  channel: z.enum([
    'agent:comment:stream',
    'agent:distillation-review:stream',
    'agent:annotate:stream',
  ]),
  requestId: z.string().min(1).max(128),
});

const desktopIpcMainEventSchemas = {
  'app:renderer-ready': z.tuple([]),
  'agent:stream-cancel': z.tuple([streamCancelSchema]),
  'agent:comment:stream': z.tuple([desktopIpcStreamSchemas['agent:comment:stream']]),
  'agent:distillation-review:stream': z.tuple([
    desktopIpcStreamSchemas['agent:distillation-review:stream'],
  ]),
  'agent:annotate:stream': z.tuple([desktopIpcStreamSchemas['agent:annotate:stream']]),
} satisfies Record<DesktopIpcToMainEventChannel, z.ZodType>;

export function validateDesktopIpcMainEventArgs<Channel extends DesktopIpcToMainEventChannel>(
  channel: Channel,
  args: unknown[],
):
  | { success: true; data: DesktopIpcToMainEventArgs<Channel> }
  | { success: false; error: ReturnType<typeof desktopIpcInvalidArgsError> } {
  const boundaryError = payloadBoundaryError(channel, args);
  if (boundaryError) return { success: false, error: boundaryError };
  const result = desktopIpcMainEventSchemas[channel].safeParse(args);
  if (result.success) {
    return { success: true, data: result.data as DesktopIpcToMainEventArgs<Channel> };
  }
  return { success: false, error: desktopIpcInvalidArgsError(channel, result.error) };
}

export function validateDesktopIpcStreamRequest<Channel extends DesktopIpcStreamChannel>(
  channel: Channel,
  request: unknown,
):
  | { success: true; data: DesktopIpcStreamRequest<Channel> }
  | {
      success: false;
      error: ReturnType<typeof desktopIpcInvalidArgsError>;
      requestId?: string;
    } {
  const boundaryError = payloadBoundaryError(channel, request);
  if (boundaryError) {
    return { success: false, error: boundaryError, requestId: safeRequestId(request) };
  }
  const result = desktopIpcStreamSchemas[channel].safeParse(request);
  if (result.success) {
    return { success: true, data: result.data as DesktopIpcStreamRequest<Channel> };
  }
  return {
    success: false,
    error: desktopIpcInvalidArgsError(channel, result.error),
    requestId: safeRequestId(request),
  };
}

function streamRequestSchema<Payload>(payload: z.ZodType<Payload>) {
  return z.looseObject({
    requestId: requestIdSchema,
    payload,
  });
}

function boundedPayload<Schema extends z.ZodType>(schema: Schema) {
  return schema.superRefine((value, context) => {
    const issue = payloadBoundaryIssue(value);
    if (issue) context.addIssue({ code: 'custom', message: issue });
  });
}

function payloadBoundaryError(channel: string, value: unknown) {
  const issue = payloadBoundaryIssue(value);
  if (!issue) return undefined;
  return desktopIpcInvalidArgsError(channel, {
    issues: [{ code: 'custom', message: issue, path: [] }],
  });
}

function payloadBoundaryIssue(root: unknown) {
  const stack = [{ depth: 0, value: root }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > MAX_PAYLOAD_NODES) return 'Payload contains too many values';
    if (current.depth > MAX_PAYLOAD_DEPTH) return 'Payload nesting is too deep';
    if (typeof current.value === 'string' && current.value.length > MAX_ARTICLE_TEXT_LENGTH) {
      return 'Payload contains an overlong string';
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_INDEX_LIST_LENGTH)
        return 'Payload contains an oversized array';
      for (const value of current.value) stack.push({ depth: current.depth + 1, value });
      continue;
    }
    if (!isRecord(current.value)) continue;
    const values = Object.values(current.value);
    if (values.length > MAX_OBJECT_KEYS) return 'Payload object contains too many properties';
    for (const value of values) stack.push({ depth: current.depth + 1, value });
  }
  return undefined;
}

function safeRequestId(request: unknown) {
  if (!isRecord(request)) return undefined;
  return isDesktopIpcStreamRequestId(request.requestId) ? request.requestId : undefined;
}
