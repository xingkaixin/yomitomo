import type {
  Agent,
  AgentAnnotationDensity,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMentionInstruction,
  AgentMentionInstructionPayload,
  AgentMessagePayload,
  AgentPersonality,
  Annotation,
  AnnotationMetadata,
  AnnotationMetadataPayload,
  ArticleRecord,
  ChapterDescriptor,
  ChapterRouteContext,
  EpubBookIndex,
  EpubChapterIndex,
  Comment,
  FocusCoReadingRoutePayload,
  FocusCoReadingRouteResult,
  LlmProvider,
  ReadingMemory,
  ReadingDeliberationRecord,
  ReadingCardReviewRecord,
  ReadingCardRecord,
  ReadingCardReviewerResult,
} from '@yomitomo/shared';
import {
  agentPersonalities,
  agentReadingIntentOptions,
  normalizeAgentReadingIntent,
} from '@yomitomo/shared';
import {
  annotationDensityInstruction,
  annotationDensityMax,
  buildCurrentChapterLexicalRelatedPassages,
  buildReadingContextBundle,
  buildReadingQuestions,
  createAgentAnnotation,
  mergeReadingMemory,
  normalizeAnnotationType,
  parseAnnotationSuggestions,
  readingContextTextForRange,
  selectionThreadSpoilerPolicy,
  wholeBookSpoilerPolicy,
  type AnnotationSuggestion,
  type ReadingCardEvidenceUnit,
  type ReadingContextBundle,
} from '@yomitomo/core';
import { logAiError, logAiInfo } from './logger';
import { packReadingContext } from './context-packing';
import {
  budgetArticleText,
  budgetDeliberationJson,
  budgetEvidenceJson,
  budgetReadingCardJson,
  formatBudgetNotice,
} from './budget';
import { callProviderText, streamProviderText } from './provider-client';
import {
  buildSelectionAnnotationContext,
  buildSelectionThreadContext,
  selectionAnnotationContextPrompt,
  selectionThreadContextPrompt,
} from './selection-context';
import {
  buildSegmentAnnotationTask,
  buildSegmentAnnotationTasks,
  segmentAnnotationContextPrompt,
  type SegmentAnnotationTask,
} from './segment-annotation-context';
import { generateSegmentReadingMemoryUpdate } from './reading-memory';

export {
  budgetArticleText,
  budgetDeliberationJson,
  budgetEvidenceJson,
  budgetReadingCardJson,
  formatBudgetNotice,
  normalizeAnthropicError,
  type ModelBudgetReport,
  type ModelInputTask,
} from './budget';
export {
  callProviderText,
  listProviderModels,
  streamProviderText,
  type GenerateOptions,
  type TextPayload,
} from './provider-client';
export {
  collectReadingContextBlocks,
  packReadingContext,
  packReadingContextBlocks,
  type OmittedContextBlock,
  type PackedContextBlock,
  type PackedReadingContext,
  type PackReadingContextOptions,
  type TokenEstimator,
} from './context-packing';
export {
  buildSelectionAnnotationContext,
  buildSelectionThreadContext,
  selectionAnnotationContextPrompt,
  selectionThreadContextPrompt,
};
export {
  aggregateEpubEvaluation,
  epubEvaluationBookTypes,
  epubEvaluationChapterLengths,
  epubEvaluationControlGroups,
  epubEvaluationFailureLabels,
  epubEvaluationTaskTypes,
  epubPhaseOneCriteria,
  evaluateEpubPhaseOne,
  evaluateEpubRun,
  type EpubEvaluationBookType,
  type EpubEvaluationCase,
  type EpubEvaluationCaseResult,
  type EpubEvaluationChapterLength,
  type EpubEvaluationControlGroup,
  type EpubEvaluationControlSummary,
  type EpubEvaluationExpectation,
  type EpubEvaluationFailureLabel,
  type EpubEvaluationManualScores,
  type EpubEvaluationMetrics,
  type EpubEvaluationReport,
  type EpubEvaluationRun,
  type EpubEvaluationSegmentOutput,
  type EpubEvaluationTaskInput,
  type EpubEvaluationTaskType,
  type EpubEvaluationUsage,
  type EpubPhaseOneCheck,
  type EpubPhaseOneCriteria,
} from './evaluation';
export { epubEvaluationBooks, epubEvaluationCases } from './evaluation-fixtures';
export { setAiLogger, type AiLogger } from './logger';

export type GenerateReadingCardInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  readingDeliberation?: ReadingDeliberationRecord;
};

export type GenerateReadingDeliberationInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
};

export type ReviewReadingCardInput = GenerateReadingCardInput & {
  readingCard: ReadingCardRecord;
  previousReview?: ReadingCardReviewRecord;
  reviewAgentIds?: string[];
};

export type ReviewReadingCardResult = Pick<
  ReadingCardReviewerResult,
  'status' | 'verdict' | 'summary' | 'findings' | 'acceptedClaims' | 'missingAngles' | 'rawResponse'
>;

export async function testProvider(
  provider: LlmProvider,
): Promise<{ ok: boolean; message: string }> {
  try {
    const content = await callProviderText(provider, {
      system: 'You are a connectivity test assistant.',
      user: 'Reply with OK only.',
      maxTokens: 128,
    });
    return { ok: true, message: content };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Provider 测试失败' };
  }
}

export async function inferAnnotationMetadata(
  provider: LlmProvider,
  payload: AnnotationMetadataPayload,
): Promise<AnnotationMetadata> {
  const content = await callProviderText(provider, {
    system:
      '你是 Yomitomo 阅读器的批注标签器。根据用户选区和批注内容，选择最贴切的批注类型和阅读动作。只返回 JSON。',
    user: buildAnnotationMetadataPrompt(payload),
    maxTokens: 240,
    temperature: 0,
  });
  return parseAnnotationMetadata(content);
}

export async function planAgentMentionInstructions(
  provider: LlmProvider,
  payload: AgentMentionInstructionPayload,
): Promise<AgentMentionInstruction[]> {
  const content = await callProviderText(provider, {
    system:
      '你是 Yomitomo 阅读器的 @ 助手任务拆解器。根据用户文本，把每个被 @ 的助手应该执行的阅读任务拆开。只返回 JSON。',
    user: buildAgentMentionInstructionPrompt(payload),
    maxTokens: 900,
    temperature: 0,
  });
  return parseAgentMentionInstructions(content, payload.agents);
}

export async function planFocusCoReadingRoute(
  provider: LlmProvider,
  payload: FocusCoReadingRoutePayload,
  agents: Agent[],
): Promise<FocusCoReadingRouteResult> {
  const selectedAgents = agents.filter((agent) => payload.selectedAgentIds.includes(agent.id));
  if (selectedAgents.length === 0) throw new Error('请选择参与共读的助手');

  const content = await callProviderText(provider, {
    system:
      '你是 Yomitomo 的聚焦共读任务路由。根据文章章节和助手角色卡，为章节补充摘要、标签，并给出章节级助手分配。只返回 JSON。',
    user: buildFocusCoReadingRoutePrompt(payload, selectedAgents),
    maxTokens: 3200,
    temperature: 0.2,
  });

  return parseFocusCoReadingRouteResult(content, payload, selectedAgents);
}

export async function runAgentStream(
  provider: LlmProvider,
  agent: PromptAgent & { temperature: number },
  payload: AgentMessagePayload,
  onDelta: (delta: string) => void,
): Promise<void> {
  const system = buildAgentMessageSystemPrompt(agent, payload);
  const user = buildAgentPrompt(provider, payload, agent);
  await streamProviderText(
    provider,
    { system, user, maxTokens: 1200, temperature: agent.temperature },
    onDelta,
  );
}

export async function runAgent(
  provider: LlmProvider,
  agent: {
    id: string;
    presetId?: string;
    username: string;
    nickname: string;
    avatar: string;
    annotationColor: string;
    temperature: number;
    soul: string;
  },
  payload: AgentMessagePayload,
): Promise<Comment> {
  const system = buildAgentMessageSystemPrompt(agent, payload);
  const user = buildAgentPrompt(provider, payload, agent);
  const content = await callProviderText(provider, {
    system,
    user,
    maxTokens: 1200,
    temperature: agent.temperature,
  });

  return {
    id: '',
    author: 'ai',
    content,
    createdAt: new Date().toISOString(),
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    readingIntent: payload.readingIntent,
  };
}

export async function runAgentAnnotate(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
): Promise<Annotation[]> {
  const system = buildAgentAnnotateSystemPrompt(agent, payload);
  const segmentTasks = buildSegmentAnnotationTasks(payload, agent);
  if (segmentTasks.length > 0) {
    return runAgentSegmentAnnotate(provider, agent, payload, system, segmentTasks);
  }
  const context = buildAgentAnnotateContextBundle(payload);
  const content = await callProviderText(provider, {
    system,
    user: buildAgentAnnotatePrompt(provider, payload, agent, context),
    maxTokens: 4000,
    temperature: agent.temperature,
  });
  const suggestions = parseAnnotationSuggestions(content);
  const now = new Date().toISOString();
  const maxAnnotations = agentAnnotationOutputLimit(agent, payload, context);
  const annotations: Annotation[] = [];

  for (const suggestion of suggestions) {
    if (annotations.length >= maxAnnotations) break;
    if (suggestion.shouldShow === false) continue;
    const annotation = createAgentAnnotation(
      agent,
      payload.article.text,
      {
        ...suggestion,
        ...targetAnchorSuggestion(payload),
        annotationType: payload.annotationType || suggestion.annotationType,
        readingIntent: payload.readingIntent || suggestion.readingIntent,
      },
      now,
      { ebookIndex: payload.article.ebookIndex },
    );
    if (annotation) annotations.push(annotation);
  }

  return annotations;
}

export async function runAgentAnnotateWithMemory(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
): Promise<AgentAnnotateResult> {
  const system = buildAgentAnnotateSystemPrompt(agent, payload);
  const segmentTasks = buildSegmentAnnotationTasks(payload, agent);
  if (segmentTasks.length > 0) {
    return runAgentSegmentAnnotateWithMemory(provider, agent, payload, system, segmentTasks);
  }
  return {
    annotations: await runAgentAnnotate(provider, agent, payload),
    readingMemory: payload.readingMemory,
  };
}

export async function runAgentAnnotateStream(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  onAnnotation: (annotation: Annotation) => void,
): Promise<AgentAnnotateResult> {
  const system = buildAgentAnnotateSystemPrompt(agent, payload);
  const segmentTasks = buildSegmentAnnotationTasks(payload, agent);
  if (segmentTasks.length > 0) {
    return runAgentSegmentAnnotateStreamWithMemory(
      provider,
      agent,
      payload,
      system,
      segmentTasks,
      onAnnotation,
    );
  }
  const context = buildAgentAnnotateContextBundle(payload);
  const maxAnnotations = agentAnnotationOutputLimit(agent, payload, context);
  const annotations: Annotation[] = [];
  let annotationCount = 0;
  const flushJson = (json: string) => {
    if (annotationCount >= maxAnnotations) return;
    try {
      const parsed = JSON.parse(json) as {
        exact?: unknown;
        prefix?: unknown;
        suffix?: unknown;
        context?: unknown;
        comment?: unknown;
        type?: unknown;
        readingIntent?: unknown;
      };
      const exact = typeof parsed.exact === 'string' ? parsed.exact : '';
      const annotation = createAgentAnnotation(
        agent,
        payload.article.text,
        {
          exact,
          prefix: typeof parsed.prefix === 'string' ? parsed.prefix : undefined,
          suffix: typeof parsed.suffix === 'string' ? parsed.suffix : undefined,
          context: typeof parsed.context === 'string' ? parsed.context : undefined,
          comment: typeof parsed.comment === 'string' ? parsed.comment : '',
          annotationType: payload.annotationType || normalizeAnnotationType(parsed.type),
          readingIntent: payload.readingIntent || normalizeAgentReadingIntent(parsed.readingIntent),
          ...targetAnchorSuggestion(payload),
        },
        new Date().toISOString(),
        { ebookIndex: payload.article.ebookIndex },
      );
      if (annotation) {
        annotationCount += 1;
        annotations.push(annotation);
        onAnnotation(annotation);
      } else {
        logAiInfo('agent.annotate.skip', {
          agent: agent.username,
          reason: 'exact_not_found',
          exactPreview: exact.slice(0, 120),
        });
      }
    } catch (error) {
      logAiError('agent.annotate.ndjson_parse_error', error, {
        agent: agent.username,
        line: json.slice(0, 500),
      });
    }
  };
  let buffer = '';
  const flushBuffer = () => {
    const result = extractJsonObjects(buffer);
    buffer = result.rest;
    for (const json of result.objects) flushJson(json);
  };

  await streamProviderText(
    provider,
    {
      system,
      user: buildAgentAnnotateStreamPrompt(provider, payload, agent, context),
      maxTokens: 4000,
      temperature: agent.temperature,
    },
    (delta) => {
      buffer += delta;
      flushBuffer();
    },
  );

  flushBuffer();
  if (hasIncompleteJson(buffer)) {
    logAiInfo('agent.annotate.incomplete_json', {
      agent: agent.username,
      line: buffer.trim().slice(0, 500),
    });
  }
  return { annotations, readingMemory: payload.readingMemory };
}

async function runAgentSegmentAnnotate(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
) {
  const annotations: Annotation[] = [];
  const deduper = createSegmentAnnotationDeduper(payload.article.text, payload.annotations || []);
  const now = new Date().toISOString();

  for (const task of segmentTasks) {
    const content = await callProviderText(provider, {
      system,
      user: buildAgentSegmentAnnotatePrompt(payload, agent, task),
      maxTokens: 3000,
      temperature: agent.temperature,
    });
    const maxAnnotations = segmentAnnotationOutputLimit(agent, task);
    let annotationCount = 0;

    for (const suggestion of parseAnnotationSuggestions(content)) {
      if (annotationCount >= maxAnnotations) break;
      const annotation = createSegmentAnnotation(agent, payload, task, suggestion, now);
      if (!annotation) {
        logAiInfo('agent.segment_annotate.skip', {
          agent: agent.username,
          segmentId: task.segment.id,
          reason: 'exact_not_in_allowed_segment',
          exactPreview: suggestion.exact.slice(0, 120),
        });
        continue;
      }
      if (!deduper.accept(annotation)) continue;
      annotations.push(annotation);
      annotationCount += 1;
    }
  }

  return annotations;
}

async function runAgentSegmentAnnotateWithMemory(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
): Promise<AgentAnnotateResult> {
  const annotations: Annotation[] = [];
  const deduper = createSegmentAnnotationDeduper(payload.article.text, payload.annotations || []);
  const now = new Date().toISOString();
  let readingMemory = payload.readingMemory;

  for (const baseTask of segmentTasks) {
    const task = refreshedSegmentAnnotationTask(
      payload,
      agent,
      baseTask,
      annotations,
      readingMemory,
    );
    const content = await callProviderText(provider, {
      system,
      user: buildAgentSegmentAnnotatePrompt(payload, agent, task),
      maxTokens: 3000,
      temperature: agent.temperature,
    });
    const maxAnnotations = segmentAnnotationOutputLimit(agent, task);
    let annotationCount = 0;
    const segmentAnnotations: Annotation[] = [];

    for (const suggestion of parseAnnotationSuggestions(content)) {
      if (annotationCount >= maxAnnotations) break;
      const annotation = createSegmentAnnotation(agent, payload, task, suggestion, now);
      if (!annotation) {
        logAiInfo('agent.segment_annotate.skip', {
          agent: agent.username,
          segmentId: task.segment.id,
          reason: 'exact_not_in_allowed_segment',
          exactPreview: suggestion.exact.slice(0, 120),
        });
        continue;
      }
      if (!deduper.accept(annotation)) continue;
      annotations.push(annotation);
      segmentAnnotations.push(annotation);
      annotationCount += 1;
    }

    const update = await generateSegmentReadingMemoryUpdate(
      provider,
      agent,
      { ...payload, readingMemory },
      task,
      segmentAnnotations,
    );
    readingMemory = mergeReadingMemory(readingMemory, update);
  }

  return { annotations, readingMemory };
}

async function runAgentSegmentAnnotateStreamWithMemory(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
  onAnnotation: (annotation: Annotation) => void,
): Promise<AgentAnnotateResult> {
  const annotations: Annotation[] = [];
  const deduper = createSegmentAnnotationDeduper(payload.article.text, payload.annotations || []);
  let readingMemory = payload.readingMemory;

  for (const baseTask of segmentTasks) {
    const task = refreshedSegmentAnnotationTask(
      payload,
      agent,
      baseTask,
      annotations,
      readingMemory,
    );
    const segmentAnnotations: Annotation[] = [];
    const maxAnnotations = segmentAnnotationOutputLimit(agent, task);
    let annotationCount = 0;
    const flushJson = (json: string) => {
      if (annotationCount >= maxAnnotations) return;
      try {
        const suggestion = parseAnnotationSuggestions(`[${json}]`)[0];
        if (!suggestion) return;
        const annotation = createSegmentAnnotation(agent, payload, task, suggestion);
        if (!annotation) {
          logAiInfo('agent.segment_annotate.skip', {
            agent: agent.username,
            segmentId: task.segment.id,
            reason: 'exact_not_in_allowed_segment',
            exactPreview: suggestion.exact.slice(0, 120),
          });
          return;
        }
        if (!deduper.accept(annotation)) return;
        annotations.push(annotation);
        segmentAnnotations.push(annotation);
        annotationCount += 1;
        onAnnotation(annotation);
      } catch (error) {
        logAiError('agent.segment_annotate.ndjson_parse_error', error, {
          agent: agent.username,
          segmentId: task.segment.id,
          line: json.slice(0, 500),
        });
      }
    };
    let buffer = '';
    const flushBuffer = () => {
      const result = extractJsonObjects(buffer);
      buffer = result.rest;
      for (const json of result.objects) flushJson(json);
    };

    await streamProviderText(
      provider,
      {
        system,
        user: buildAgentSegmentAnnotateStreamPrompt(payload, agent, task),
        maxTokens: 3000,
        temperature: agent.temperature,
      },
      (delta) => {
        buffer += delta;
        flushBuffer();
      },
    );

    flushBuffer();
    if (hasIncompleteJson(buffer)) {
      logAiInfo('agent.segment_annotate.incomplete_json', {
        agent: agent.username,
        segmentId: task.segment.id,
        line: buffer.trim().slice(0, 500),
      });
    }

    const update = await generateSegmentReadingMemoryUpdate(
      provider,
      agent,
      { ...payload, readingMemory },
      task,
      segmentAnnotations,
    );
    readingMemory = mergeReadingMemory(readingMemory, update);
  }

  return { annotations, readingMemory };
}

function refreshedSegmentAnnotationTask(
  payload: AgentAnnotatePayload,
  agent: Agent,
  task: SegmentAnnotationTask,
  acceptedAnnotations: Annotation[],
  readingMemory: ReadingMemory | undefined,
) {
  return (
    buildSegmentAnnotationTask(
      {
        ...payload,
        annotations: [...(payload.annotations || []), ...acceptedAnnotations],
        readingMemory,
      },
      agent,
      task.planItem,
      task.segment,
      task.context.allowedAnchorRange,
    ) || task
  );
}

function createSegmentAnnotation(
  agent: Agent,
  payload: AgentAnnotatePayload,
  task: SegmentAnnotationTask,
  suggestion: AnnotationSuggestion,
  now = new Date().toISOString(),
) {
  if (suggestion.shouldShow === false) return null;
  return createAgentAnnotation(
    agent,
    payload.article.text,
    {
      ...suggestion,
      annotationType: payload.annotationType || suggestion.annotationType,
      readingIntent:
        task.planItem.readingIntent || payload.readingIntent || suggestion.readingIntent,
    },
    now,
    task.createOptions,
  );
}

function buildAgentSegmentAnnotatePrompt(
  payload: AgentAnnotatePayload,
  agent: Agent,
  task: SegmentAnnotationTask,
) {
  const promptPayload = {
    ...payload,
    readingIntent: task.planItem.readingIntent || payload.readingIntent,
  };
  const density = task.targetDensity || agent.annotationDensity;
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${segmentAnnotationContextPrompt(task)}${readingIntentPromptLine(promptPayload)}${instructionPromptLine(payload)}\n\n请返回 JSON 数组。每个元素包含：\n- exact：必须来自 currentSegment 的 allowedAnchorRange.coreParagraphIds，逐字一致，不能来自 retrieved_evidence、segment_memory、segment_trace、next_preview、chapter_trace 或 dedup\n- prefix：exact 前方 10-40 个字，来自 currentSegment 原文\n- suffix：exact 后方 10-40 个字，来自 currentSegment 原文\n- type：只允许 key_point、assumption、concept、question、quote\n- readingIntent：章节 readingIntent 有值时必须等于该值；否则从 explain、decompose、challenge、question、connect 中选择\n- moveType：只允许 explain_concept、surface_assumption、ask_question、connect_previous、challenge_argument、reader_application、style_observation、structure_marker、definition_watch、foreshadowing_watch\n- whyHere：说明为什么这一个位置值得批注，避免泛泛摘要\n- evidenceUsed：数组，只能包含 localText、chapterSummary、trace、relatedPassage\n- confidence：low、medium 或 high\n- shouldShow：布尔值，只有确信值得展示才为 true\n- comment：写给读者的批注评论，要体现 moveType，不要写“这段说明了”式摘要\n\n批注密度：${annotationDensityInstruction(density, task.context.currentSegment.text)}\n\n选择标准：优先选择会改变理解、暴露前提、连接前文、提出好问题或标记结构的位置；没有价值返回空数组。\n\n只返回 JSON，不要输出 Markdown。`;
}

function buildAgentSegmentAnnotateStreamPrompt(
  payload: AgentAnnotatePayload,
  agent: Agent,
  task: SegmentAnnotationTask,
) {
  const promptPayload = {
    ...payload,
    readingIntent: task.planItem.readingIntent || payload.readingIntent,
  };
  const density = task.targetDensity || agent.annotationDensity;
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${segmentAnnotationContextPrompt(task)}${readingIntentPromptLine(promptPayload)}${instructionPromptLine(payload)}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{"exact":"currentSegment 中的原文连续片段","prefix":"exact 前方 10-40 个字","suffix":"exact 后方 10-40 个字","type":"key_point","readingIntent":"explain","moveType":"explain_concept","whyHere":"为什么选这里","evidenceUsed":["localText"],"confidence":"high","shouldShow":true,"comment":"写给读者的批注评论"}\n\n批注密度：${annotationDensityInstruction(density, task.context.currentSegment.text)}\n\n要求：\n- exact 必须来自 currentSegment 的 allowedAnchorRange.coreParagraphIds，逐字一致，不能来自 retrieved_evidence、segment_memory、segment_trace、next_preview、chapter_trace 或 dedup\n- type 只允许 key_point、assumption、concept、question、quote\n- readingIntent：章节 readingIntent 有值时必须等于该值；否则从 explain、decompose、challenge、question、connect 中选择\n- moveType 只允许 explain_concept、surface_assumption、ask_question、connect_previous、challenge_argument、reader_application、style_observation、structure_marker、definition_watch、foreshadowing_watch\n- evidenceUsed 只能包含 localText、chapterSummary、trace、relatedPassage\n- 每发现一条值得批注的内容，就立刻输出一行 JSON；没有价值可以不输出任何行\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
}

function segmentAnnotationOutputLimit(agent: Agent, task: SegmentAnnotationTask) {
  return annotationDensityMax(
    task.targetDensity || agent.annotationDensity,
    task.context.currentSegment.text,
  );
}

function createSegmentAnnotationDeduper(articleText: string, existingAnnotations: Annotation[]) {
  const accepted = existingAnnotations.flatMap((annotation) => {
    const item = segmentDedupItem(articleText, annotation);
    return item ? [item] : [];
  });

  return {
    accept(annotation: Annotation) {
      const item = segmentDedupItem(articleText, annotation);
      if (!item) return true;
      if (accepted.some((existing) => segmentDedupItemsMatch(existing, item))) return false;
      accepted.push(item);
      return true;
    },
  };
}

type SegmentDedupItem = {
  exactKey: string;
  textStart: number;
  textEnd: number;
  chapterId?: string;
  segmentId?: string;
  moveType?: string;
};

function segmentDedupItem(articleText: string, annotation: Annotation): SegmentDedupItem | null {
  const textStart =
    integerValue(annotation.anchor.textStartInBook) ?? integerValue(annotation.anchor.start);
  const textEnd =
    integerValue(annotation.anchor.textEndInBook) ?? integerValue(annotation.anchor.end);
  if (textStart === null || textEnd === null || textEnd <= textStart) return null;
  return {
    exactKey: normalizeDedupText(annotation.anchor.exact || articleText.slice(textStart, textEnd)),
    textStart,
    textEnd,
    chapterId: annotation.anchor.chapterId,
    segmentId: annotation.anchor.segmentId,
    moveType: annotation.moveType,
  };
}

function segmentDedupItemsMatch(left: SegmentDedupItem, right: SegmentDedupItem) {
  const sameSegment = left.segmentId && right.segmentId && left.segmentId === right.segmentId;
  const sameChapter = left.chapterId && right.chapterId && left.chapterId === right.chapterId;
  const distance = textRangeDistance(left, right);
  if (
    left.exactKey &&
    left.exactKey === right.exactKey &&
    (sameSegment || sameChapter || distance <= 2400)
  ) {
    return true;
  }
  if (left.moveType && right.moveType && left.moveType === right.moveType) {
    return Boolean(sameSegment) || distance <= 240;
  }
  return false;
}

function normalizeDedupText(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function textRangeDistance(
  left: Pick<SegmentDedupItem, 'textStart' | 'textEnd'>,
  right: Pick<SegmentDedupItem, 'textStart' | 'textEnd'>,
) {
  if (left.textStart < right.textEnd && right.textStart < left.textEnd) return 0;
  if (left.textEnd <= right.textStart) return right.textStart - left.textEnd;
  return left.textStart - right.textEnd;
}

function integerValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
}

function agentAnnotationOutputLimit(
  agent: Agent,
  payload: AgentAnnotatePayload,
  context?: ReadingContextBundle,
) {
  if (payload.targetAnchor) return 1;
  return annotationDensityMax(agent.annotationDensity, annotationBudgetText(payload, context));
}

export function extractJsonObjects(input: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let restStart = input.length;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (start < 0) {
      if (char === '{') {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        objects.push(input.slice(start, index + 1).trim());
        start = -1;
        restStart = index + 1;
      }
    }
  }

  return { objects, rest: input.slice(start >= 0 ? start : restStart) };
}

function hasIncompleteJson(input: string) {
  return input
    .replace(/^```(?:json)?/m, '')
    .replace(/```$/m, '')
    .trim()
    .startsWith('{');
}

export async function generateReadingCard(provider: LlmProvider, input: GenerateReadingCardInput) {
  const system =
    '你是 Yomitomo 的读后笔记生成器。你的任务是基于文章全文、读者批注和讨论证据生成一篇可保存的读后笔记。你使用产品级整理策略，保持克制、准确、有判断力；不要套用任何批注助手的人格或口吻。必须区分文章观点、读者关注、助手补充。所有判断都要能回到原文或证据单元。';

  return callProviderText(provider, {
    system,
    user: buildReadingCardPrompt(provider, input),
    maxTokens: 3000,
    temperature: 0.35,
  });
}

export async function generateReadingDeliberation(
  provider: LlmProvider,
  input: GenerateReadingDeliberationInput,
) {
  const system =
    '你是 Yomitomo 的阅读审议编辑。你的任务是基于文章全文、读者批注、助手批注和评论 thread，整理这场阅读讨论已经形成的判断、分歧、证据强弱和未决问题。保持中立、具体、可追溯，所有判断都要能回到原文或证据单元。';

  return callProviderText(provider, {
    system,
    user: buildReadingDeliberationPrompt(provider, input),
    maxTokens: 3600,
    temperature: 0.3,
  });
}

export async function reviewReadingCard(
  provider: LlmProvider,
  agent: Agent,
  input: ReviewReadingCardInput,
): Promise<ReviewReadingCardResult> {
  const system = `${agent.soul}\n\n你是 Yomitomo 的读后笔记审核助手。你要审当前读后笔记和证据之间的关系，重点检查事实归因、证据链、覆盖度、压缩质量和后续行动价值。保持你的审核倾向，但输出必须克制、可执行、能回到原文或证据单元。`;
  const rawResponse = await callProviderText(
    provider,
    {
      system,
      user: buildReviewReadingCardPrompt(provider, input),
      maxTokens: 6000,
      temperature: agent.temperature,
    },
    { failOnMaxTokens: true },
  );
  return normalizeReadingCardReviewResponse(rawResponse);
}

function readingIntentOption(payload: AgentAnnotatePayload | AgentMessagePayload) {
  return agentReadingIntentOptions.find((option) => option.value === payload.readingIntent);
}

function readingIntentSystemPrompt(payload: AgentAnnotatePayload | AgentMessagePayload) {
  const option = readingIntentOption(payload);
  return option ? `\n\n${option.prompt}` : '';
}

function readingIntentPromptLine(payload: AgentAnnotatePayload | AgentMessagePayload) {
  const option = readingIntentOption(payload);
  return option ? `\n\n本轮阅读动作：${option.label}\n动作说明：${option.description}` : '';
}

type PromptAgent = {
  presetId?: string;
  soul: string;
  username?: string;
  nickname?: string;
};

type PromptAgentIdentity = {
  username?: string;
  nickname?: string;
};

function findAgentPersonality(agent: PromptAgent) {
  return agentPersonalities.find(
    (personality) => personality.id === agent.presetId || personality.soul === agent.soul,
  );
}

function buildAgentRoleCard(agent: PromptAgent) {
  const personality = findAgentPersonality(agent);
  const nickname = agent.nickname || personality?.name || agent.username || '伴读助手';
  const username = agent.username || nickname;
  const lines = [
    '## 角色卡',
    `- 当前身份：${nickname}（@${username}）`,
    ...buildPresetRoleLines(personality),
    '',
    '## 角色灵魂',
    agent.soul,
  ];
  return lines.filter((line) => line !== null).join('\n');
}

function buildPresetRoleLines(personality?: AgentPersonality) {
  if (!personality) return [];

  return [
    `- 预设身份：${personality.name}，${personality.roleTitle}`,
    `- 角色类型：${personality.kind}`,
    `- 性别设定：${personality.gender}`,
    `- 身份摘要：${personality.description}`,
    `- 公开介绍：${personality.introduction}`,
    personality.selfIntroduction ? `- 自我介绍：\n${personality.selfIntroduction}` : null,
    `- 场景设定：${personality.sceneDescription}`,
    `- 画像线索：${personality.portraitPrompt}`,
    `- 阅读场景线索：${personality.scenePrompt}`,
  ].filter((line): line is string => Boolean(line));
}

export function buildAgentMessageSystemPrompt(agent: PromptAgent, payload: AgentMessagePayload) {
  const username = agent.username || payload.agentUsername;
  const nickname = agent.nickname || username;
  const selfNames = [nickname, `@${username}`]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join('、');

  return `${buildAgentRoleCard(agent)}\n\n你正在作为网页阅读器里的 ${nickname}（@${username}）参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。${readingIntentSystemPrompt(payload)}\n\n身份识别：你就是 ${nickname}（@${username}）。当前讨论里出现 ${selfNames} 时，按你本人理解。结合上下文判断读者是在询问你的批注、你的判断，还是在询问其他助手的观点。涉及自己的判断时，用自然的第一人称承接；涉及其他助手时，使用对方昵称或 @。\n\n角色表达：把角色卡中的自我介绍、核心气质、判断习惯和输出偏好落实到回复里；从你的专业能力切入，给出有辨识度的判断。`;
}

function annotationTypePromptLine(payload: AgentAnnotatePayload) {
  return payload.annotationType ? `\n本轮批注类型：${payload.annotationType}` : '';
}

function instructionPromptLine(payload: AgentAnnotatePayload) {
  return payload.instruction ? `\n读者指导：${payload.instruction}` : '';
}

function buildAgentAnnotateSystemPrompt(agent: Agent, payload: AgentAnnotatePayload) {
  const scope = payload.targetAnchor
    ? `你正在作为网页阅读器里的 @${agent.username} 对读者选中的文本创建批注。批注以目标选区为锚点，可以参考提供的局部上下文，但只围绕目标选区本身展开。`
    : `你正在作为网页阅读器里的 @${agent.username} 主动阅读文章并创建批注。只标出真正值得讨论的原文片段：金句、关键判断、强论点、反常规观点、潜在漏洞、值得追问的前提、与读者决策相关的信息。平平无奇的句子直接跳过。`;
  return `${buildAgentRoleCard(agent)}\n\n${scope}${readingIntentSystemPrompt(payload)}`;
}

function targetAnchorSuggestion(payload: AgentAnnotatePayload) {
  const anchor = payload.targetAnchor;
  return anchor
    ? {
        exact: anchor.exact,
        prefix: anchor.prefix,
        suffix: anchor.suffix,
      }
    : {};
}

function buildAgentMessageContextBundle(payload: AgentMessagePayload) {
  const spoilerPolicy =
    payload.spoilerPolicy ||
    (payload.article.ebookIndex ? selectionThreadSpoilerPolicy : wholeBookSpoilerPolicy);
  return buildReadingContextBundle({
    articleText: payload.article.text,
    ebookIndex: payload.article.ebookIndex,
    targetAnchor: payload.annotation.anchor,
    readerProgress: payload.readerProgress,
    spoilerPolicy,
    relatedPassages: agentMessageRelatedPassages(payload, spoilerPolicy),
  });
}

function buildAgentAnnotateContextBundle(payload: AgentAnnotatePayload) {
  const spoilerPolicy =
    payload.spoilerPolicy || (payload.article.ebookIndex ? undefined : wholeBookSpoilerPolicy);
  return buildReadingContextBundle({
    articleText: payload.article.text,
    ebookIndex: payload.article.ebookIndex,
    targetAnchor: payload.targetAnchor,
    readingPlan: payload.readingPlan,
    readerProgress: payload.readerProgress,
    spoilerPolicy,
    relatedPassages: agentAnnotateRelatedPassages(payload, spoilerPolicy),
  });
}

function agentMessageRelatedPassages(
  payload: AgentMessagePayload,
  spoilerPolicy: ReadingContextBundle['spoilerPolicy'],
) {
  const index = payload.article.ebookIndex;
  if (!index) return [];
  return buildCurrentChapterLexicalRelatedPassages({
    articleText: payload.article.text,
    ebookIndex: index,
    query: [payload.annotation.anchor.exact, payload.userComment.content],
    targetAnchor: payload.annotation.anchor,
    readerProgress: payload.readerProgress,
    spoilerPolicy,
    excludeParagraphIds: [payload.annotation.anchor.paragraphId].filter((id): id is string =>
      Boolean(id),
    ),
    maxPassages: 4,
    neighborParagraphs: 1,
  });
}

function agentAnnotateRelatedPassages(
  payload: AgentAnnotatePayload,
  spoilerPolicy: ReadingContextBundle['spoilerPolicy'] | undefined,
) {
  const index = payload.article.ebookIndex;
  const targetAnchor = payload.targetAnchor;
  if (!index || !targetAnchor) return [];
  return buildCurrentChapterLexicalRelatedPassages({
    articleText: payload.article.text,
    ebookIndex: index,
    query: [targetAnchor.exact, payload.instruction || ''],
    targetAnchor,
    readerProgress: payload.readerProgress,
    spoilerPolicy,
    excludeParagraphIds: [targetAnchor.paragraphId].filter((id): id is string => Boolean(id)),
    maxPassages: 3,
    neighborParagraphs: 1,
  });
}

function spoilerScopePrompt(context: ReadingContextBundle) {
  if (context.spoilerPolicy.allowedScope === 'whole-book') return '';
  return '\n\n防剧透范围：可用证据已经按读者进度裁剪。只使用提供的可用原文、目标选区和讨论内容；不要引用、概括或推断未提供的后文章节、剧情或论证。';
}

function annotationBudgetText(payload: AgentAnnotatePayload, context?: ReadingContextBundle) {
  if (payload.targetAnchor) return payload.targetAnchor.exact;
  if (!payload.readingPlan?.length) return context?.articleText || payload.article.text;

  return payload.readingPlan
    .map((item) =>
      context
        ? readingContextTextForRange(
            payload.article.text,
            context.textRanges,
            item.sectionStart,
            item.sectionEnd,
          )
        : payload.article.text.slice(item.sectionStart, item.sectionEnd),
    )
    .join('\n');
}

function readingPlanPrompt(payload: AgentAnnotatePayload, context: ReadingContextBundle) {
  if (!payload.readingPlan?.length) return '';

  const plan = payload.readingPlan.map((item, index) => {
    const option = item.readingIntent
      ? agentReadingIntentOptions.find((entry) => entry.value === item.readingIntent)
      : undefined;
    return {
      index: index + 1,
      sectionId: item.sectionId,
      sectionTitle: item.sectionTitle,
      sectionSummary: item.sectionSummary || '',
      sectionTag: item.sectionTag || '',
      action: option?.label || '',
      readingIntent: item.readingIntent || '',
      actionDescription: option?.description || '',
      readerMessages: item.messages || [],
      sectionText: readingContextTextForRange(
        payload.article.text,
        context.textRanges,
        item.sectionStart,
        item.sectionEnd,
      ),
    };
  });

  return `\n\n本轮聚焦共读编排：\n${JSON.stringify(plan, null, 2)}\n\n编排要求：\n- 你只能使用本轮提供的可用原文范围理解上下文。\n- 只在编排列表里的 sectionText 内选择批注片段。\n- sectionSummary 和 sectionTag 用于帮助你快速定位章节重点。\n- readerMessages 是读者给本章节或给你的留言，请作为阅读关注点。\n- readingIntent 为空时，你根据原文、留言和角色卡自行选择每条批注的 readingIntent。\n- readingIntent 有值时，每条批注使用该章节对应的 readingIntent。\n- 输出的 exact 必须来自对应 sectionText 的连续原文。\n- 没有讨论价值的章节可以不输出。`;
}

function selectionAnnotationPromptBlock(
  payload: AgentAnnotatePayload,
  agent: Agent,
  context: ReadingContextBundle,
) {
  const selectionContext = buildSelectionAnnotationContext(payload, agent, context);
  return selectionContext ? selectionAnnotationContextPrompt(selectionContext) : '';
}

export function buildAgentPrompt(
  provider: LlmProvider,
  payload: AgentMessagePayload,
  agent?: PromptAgentIdentity,
) {
  const context = buildAgentMessageContextBundle(payload);
  const comments = payload.annotation.comments
    .map((comment) => {
      const author =
        comment.author === 'ai' ? formatAgentAuthor(comment) : formatUserAuthor(comment);
      return `${author}: ${comment.content}`;
    })
    .join('\n');
  const userMention = formatUserMention(payload.userComment);
  const participants = buildAgentMessageParticipants(payload, agent);
  const selfInstruction = buildAgentSelfInstruction(payload, agent);
  const threadContextPrompt = selectionThreadPromptBlock(payload, context);

  if (threadContextPrompt) {
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${threadContextPrompt}${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n可提及的读者账号：${userMention}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。回复必须回到 thread-first 上下文中的原文依据。`;
  }

  const article = budgetArticleText(provider, 'agent-message', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n可提及的读者账号：${userMention}\n\n当前批注讨论：\n${comments}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。`;
}

function selectionThreadPromptBlock(payload: AgentMessagePayload, context: ReadingContextBundle) {
  const threadContext = buildSelectionThreadContext(payload, context);
  return threadContext ? selectionThreadContextPrompt(threadContext) : '';
}

function buildAgentSelfInstruction(
  payload: AgentMessagePayload,
  currentAgent?: PromptAgentIdentity,
) {
  const username = currentAgent?.username || payload.agentUsername;
  const nickname = currentAgent?.nickname || username;
  const selfNames = [nickname, `@${username}`]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join('、');

  return `本轮发言者：${nickname}（@${username}）\n身份识别规则：读者评论里的 ${selfNames} 指向你本人。先判断读者是在询问你的批注、你的判断，还是在询问其他助手的观点。涉及自己的判断时，用自然的第一人称承接；涉及其他助手时，使用对方昵称或 @。`;
}

function buildAgentMessageParticipants(
  payload: AgentMessagePayload,
  currentAgent?: PromptAgentIdentity,
) {
  const participants = new Map<string, string>();
  const currentUsername = currentAgent?.username || payload.agentUsername;
  const currentNickname = currentAgent?.nickname || currentUsername;

  addParticipant(participants, currentUsername, currentNickname, '当前发言助手');
  for (const agent of payload.agentRoster || []) {
    addParticipant(participants, agent.username, agent.nickname, '可被 @ 的伴读助手');
  }
  addCommentParticipant(participants, payload.annotation, '原批注作者');
  for (const comment of payload.annotation.comments) {
    addCommentParticipant(participants, comment, '评论作者');
  }

  return Array.from(participants.values()).join('\n') || '- 当前讨论暂无可识别参与者';
}

function addCommentParticipant(
  participants: Map<string, string>,
  item: Annotation | Comment,
  role: string,
) {
  if (item.author === 'ai') {
    addParticipant(participants, item.agentUsername || '', item.agentNickname || '', role);
    return;
  }
  addParticipant(participants, item.userUsername || '', item.userNickname || '', role);
}

function addParticipant(
  participants: Map<string, string>,
  username: string,
  nickname: string,
  role: string,
) {
  const display = nickname || username;
  const handle = username ? `@${username}` : '';
  if (!display && !handle) return;
  const key = username || display;
  if (participants.has(key)) return;
  participants.set(key, `- ${display}${handle ? `（${handle}）` : ''}：${role}`);
}

function formatAgentAuthor(comment: Comment) {
  if (comment.agentNickname && comment.agentUsername) {
    return `${comment.agentNickname} (@${comment.agentUsername})`;
  }
  return comment.agentNickname || (comment.agentUsername ? `@${comment.agentUsername}` : 'AI');
}

function formatUserAuthor(comment: Comment) {
  if (comment.userNickname && comment.userUsername) {
    return `${comment.userNickname} (@${comment.userUsername})`;
  }
  return comment.userNickname || formatUserMention(comment);
}

function formatUserMention(comment: Comment) {
  return comment.userUsername ? `@${comment.userUsername}` : '读者';
}

function buildAgentAnnotatePrompt(
  provider: LlmProvider,
  payload: AgentAnnotatePayload,
  agent: Agent,
  context: ReadingContextBundle = buildAgentAnnotateContextBundle(payload),
) {
  const planPrompt = readingPlanPrompt(payload, context);
  if (planPrompt) {
    const article = budgetArticleText(provider, 'agent-annotate', context.articleText);
    const budgetNotice = formatBudgetNotice([article.report]);
    const readingIntentOutputLine =
      '- readingIntent：章节 readingIntent 有值时必须等于该值；章节 readingIntent 为空时，从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作';
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${planPrompt}${spoilerScopePrompt(context)}\n\n请返回 JSON 数组。每个元素包含：\n- exact：必须是对应章节中的原文连续片段，逐字一致\n- prefix：exact 前方 10-40 个字，来自文章原文\n- suffix：exact 后方 10-40 个字，来自文章原文\n- type：只允许 key_point、assumption、concept、question、quote\n${readingIntentOutputLine}\n- comment：结合章节内容、读者留言和你的角色判断写给读者的批注评论\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity, annotationBudgetText(payload, context))}\n\n类型含义：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n只返回 JSON，不要输出 Markdown。`;
  }
  if (payload.targetAnchor) {
    const readingIntentOutputLine = payload.readingIntent
      ? '- readingIntent：必须等于本轮阅读动作的值'
      : '- readingIntent：从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作';
    const commentOutputLine = payload.readingIntent
      ? '- comment：按本轮阅读动作和读者指导写给读者的批注评论'
      : '- comment：按读者指导和你的角色判断写给读者的批注评论';
    const contextPrompt = payload.article.ebookIndex
      ? `${selectionAnnotationPromptBlock(payload, agent, context)}${spoilerScopePrompt(context)}`
      : '';
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${contextPrompt}\n\n目标选区：\n${payload.targetAnchor.exact}${readingIntentPromptLine(payload)}${annotationTypePromptLine(payload)}${instructionPromptLine(payload)}\n\n请针对目标选区返回 JSON 数组，数组中放 1 个元素。元素包含：\n- exact：必须等于目标选区原文，逐字一致\n- type：使用本轮批注类型；未指定时只允许 key_point、assumption、concept、question、quote\n${readingIntentOutputLine}\n${commentOutputLine}\n\n只返回 JSON，不要输出 Markdown。`;
  }
  const article = budgetArticleText(provider, 'agent-annotate', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}\n\n请返回 JSON 数组。每个元素包含：\n- exact：必须是文章中的原文连续片段，逐字一致\n- prefix：exact 前方 10-40 个字，来自文章原文\n- suffix：exact 后方 10-40 个字，来自文章原文\n- type：只允许 key_point、assumption、concept、question、quote\n- comment：按本轮阅读动作说明这段为什么值得讨论，作为批注里的第一条评论\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity, annotationBudgetText(payload, context))}\n\n类型含义：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n选择标准：只挑符合本轮阅读动作且有讨论价值的文本；没有价值可以返回空数组。\n\n只返回 JSON，不要输出 Markdown。`;
}

function buildAgentAnnotateStreamPrompt(
  provider: LlmProvider,
  payload: AgentAnnotatePayload,
  agent: Agent,
  context: ReadingContextBundle = buildAgentAnnotateContextBundle(payload),
) {
  const planPrompt = readingPlanPrompt(payload, context);
  if (planPrompt) {
    const article = budgetArticleText(provider, 'agent-annotate', context.articleText);
    const budgetNotice = formatBudgetNotice([article.report]);
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${planPrompt}${spoilerScopePrompt(context)}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{"exact":"对应章节中的原文连续片段","prefix":"exact 前方 10-40 个字","suffix":"exact 后方 10-40 个字","type":"key_point","readingIntent":"explain","comment":"结合章节内容、读者留言和角色判断写成的批注评论"}\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity, annotationBudgetText(payload, context))}\n\n类型只允许：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n要求：\n- exact 必须来自对应 sectionText 的连续原文，逐字一致\n- prefix 和 suffix 必须来自 exact 周围的文章原文，用于区分重复文本\n- readingIntent：章节 readingIntent 有值时必须等于该值；章节 readingIntent 为空时，从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作\n- 每发现一条值得批注的内容，就立刻输出一行 JSON\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
  }
  if (payload.targetAnchor) {
    const readingIntentOutputLine = payload.readingIntent
      ? '- readingIntent：必须等于本轮阅读动作的值'
      : '- readingIntent：从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作';
    const commentOutputLine = payload.readingIntent
      ? '- comment：按本轮阅读动作和读者指导写给读者的批注评论'
      : '- comment：按读者指导和你的角色判断写给读者的批注评论';
    const contextPrompt = payload.article.ebookIndex
      ? `${selectionAnnotationPromptBlock(payload, agent, context)}${spoilerScopePrompt(context)}`
      : '';
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${contextPrompt}\n\n目标选区：\n${payload.targetAnchor.exact}${readingIntentPromptLine(payload)}${annotationTypePromptLine(payload)}${instructionPromptLine(payload)}\n\n请针对目标选区返回 1 行 NDJSON，格式为：{"exact":"目标选区原文","type":"key_point","readingIntent":"explain","comment":"批注评论"}\n\n要求：\n- exact 必须等于目标选区原文，逐字一致\n- type 使用本轮批注类型；未指定时从 key_point、assumption、concept、question、quote 中选择\n${readingIntentOutputLine}\n${commentOutputLine}\n- 只输出 1 个 JSON 对象，不要输出 Markdown，不要输出数组。`;
  }
  const article = budgetArticleText(provider, 'agent-annotate', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{"exact":"文章中的原文连续片段","prefix":"exact 前方 10-40 个字","suffix":"exact 后方 10-40 个字","type":"key_point","comment":"按本轮阅读动作说明这段为什么值得讨论"}\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity, annotationBudgetText(payload, context))}\n\n类型只允许：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n选择标准：只挑符合本轮阅读动作且有讨论价值的文本；没有价值可以不输出任何行。\n\n要求：\n- exact 必须是文章中的原文连续片段，逐字一致\n- prefix 和 suffix 必须来自 exact 周围的文章原文，用于区分重复文本\n- type 必须从允许值中选择\n- 每发现一条值得批注的内容，就立刻输出一行 JSON\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
}

function buildReadingCardPrompt(provider: LlmProvider, input: GenerateReadingCardInput) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    questionStatus: unit.questionStatus || '',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    annotationBody: unit.annotationBody
      ? {
          author: unit.annotationBody.authorLabel,
          questionStatus: unit.annotationBody.questionStatus || '',
          content: unit.annotationBody.content,
        }
      : null,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      questionStatus: comment.questionStatus || '',
      content: comment.content,
    })),
  }));
  const questions = buildReadingQuestions(input.article).map((question) => ({
    id: question.id,
    status: question.status,
    author: question.authorLabel,
    text: question.text,
    quote: question.quote,
  }));
  const deliberation = input.readingDeliberation
    ? {
        id: input.readingDeliberation.id,
        markdown: input.readingDeliberation.contentMarkdown,
        sections: input.readingDeliberation.sections,
      }
    : null;
  const articleText = budgetArticleText(provider, 'reading-card', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-card', evidence);
  const deliberationJson = deliberation
    ? budgetDeliberationJson('reading-card', deliberation)
    : { text: '暂无', report: null };
  const budgetNotice = formatBudgetNotice(
    [articleText.report, evidenceJson.report, deliberationJson.report].filter(
      (report) => report !== null,
    ),
  );

  return `请基于全文和证据单元生成一篇中文 Markdown 读后笔记。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

问题状态：
${JSON.stringify(questions, null, 2)}

阅读审议：
${deliberationJson.text}

输出要求：
- 直接输出 Markdown，不要输出代码块。
- 不要写“文章快照”。
- 不要复述全文概要。
- 每条关键判断尽量标注证据编号，例如 [#1]。
- 保留读者自己的关注点，标明“我”或读者昵称。
- 助手观点和文章观点分开表达。
- 如果有阅读审议，优先吸收其中的共识、分歧、证据强弱和未决问题。
- 保留未决问题状态：open 作为待推进问题，answered 作为已收束问题，parked 作为暂不推进问题。
- 内容要精炼、有层次，适合作为读后笔记保存。

固定结构：
# ${input.article.title}

## 核心主张
用 1-2 句话说清文章最重要的判断。

## 我关注了什么
按主题归并读者批注和评论，每条带原文证据编号。

## 讨论中浮现了什么
整理共识、分歧、未回答问题。来源来自评论 thread。

## 可复用洞见
提炼 3-5 条可以迁移到其他阅读或决策里的洞见。

## 后续行动线索
列出后续阅读、验证假设或可执行动作。`;
}

function buildReadingDeliberationPrompt(
  provider: LlmProvider,
  input: GenerateReadingDeliberationInput,
) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    questionStatus: unit.questionStatus || '',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    annotationBody: unit.annotationBody
      ? {
          author: unit.annotationBody.authorLabel,
          questionStatus: unit.annotationBody.questionStatus || '',
          content: unit.annotationBody.content,
        }
      : null,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      questionStatus: comment.questionStatus || '',
      content: comment.content,
    })),
  }));
  const questions = buildReadingQuestions(input.article).map((question) => ({
    id: question.id,
    status: question.status,
    author: question.authorLabel,
    text: question.text,
    quote: question.quote,
  }));
  const articleText = budgetArticleText(provider, 'reading-deliberation', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-deliberation', evidence);
  const budgetNotice = formatBudgetNotice([articleText.report, evidenceJson.report]);

  return `请生成一份中文 Markdown 阅读审议。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

问题状态：
${JSON.stringify(questions, null, 2)}

输出要求：
- 直接输出 Markdown，不要输出代码块。
- 每个关键判断尽量标注证据编号，例如 [#1]。
- 区分文章观点、读者关注、助手补充和评论 thread。
- 聚焦这场阅读讨论形成了什么判断，避免复述全文。
- 对证据薄弱、归因不清或仍需验证的内容明确指出。
- 单独汇总问题状态：open 是未决问题，answered 是已回答问题，parked 是搁置问题。

固定结构：
# ${input.article.title}｜阅读审议

## 共识
整理文章、读者和助手之间已经形成的主要共识。

## 分歧与张力
整理不同批注或评论之间的分歧、冲突、可挑战前提。

## 证据强弱
列出证据较强的判断和证据较弱的判断，说明依据。

## 未决问题
优先列出 open 问题，并简要说明对应证据；再用短句概括 answered 和 parked 问题。

## 给读后笔记的建议
说明生成读后笔记时应该保留、压缩或谨慎处理的内容。`;
}

function buildReviewReadingCardPrompt(provider: LlmProvider, input: ReviewReadingCardInput) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const card = {
    id: input.readingCard.id,
    sections: input.readingCard.sections,
    markdown: input.readingCard.contentMarkdown,
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    questionStatus: unit.questionStatus || '',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    annotationBody: unit.annotationBody
      ? {
          author: unit.annotationBody.authorLabel,
          questionStatus: unit.annotationBody.questionStatus || '',
          content: unit.annotationBody.content,
        }
      : null,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      questionStatus: comment.questionStatus || '',
      content: comment.content,
    })),
  }));
  const articleText = budgetArticleText(provider, 'reading-card-review', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-card-review', evidence);
  const cardJson = budgetReadingCardJson('reading-card-review', card);
  const budgetNotice = formatBudgetNotice([
    articleText.report,
    evidenceJson.report,
    cardJson.report,
  ]);

  return `请审核这篇读后笔记，返回一个 JSON 对象。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

读后笔记：
${cardJson.text}

审核维度：
- 证据链：关键判断是否能对应文章原文或证据单元。
- 归因：文章观点、读者关注、助手讨论是否表达清楚。
- 覆盖：高价值批注和评论是否被合理吸收。
- 压缩质量：是否保留有效判断，去除空泛复述。
- 行动线索：后续行动是否具体、能执行、和阅读材料有关。

输出 JSON 格式：
{
  "verdict": "pass",
  "summary": "整体审核结论，80 字以内",
  "findings": [
    {
      "section": "核心主张",
      "severity": "high",
      "problem": "问题描述",
      "evidenceIds": [1, 2],
      "suggestedRewrite": "可选，给出更好的改写"
    }
  ],
  "acceptedClaims": ["保留得好的判断"],
  "missingAngles": ["建议补充的视角"]
}

约束：
- verdict 只允许 pass 或 revise；存在高风险事实、归因或证据问题时使用 revise。
- severity 只允许 high、medium、low。
- evidenceIds 使用证据单元 id；没有对应证据时返回空数组。
- 文本字段里引用证据时统一写成 [#1] 这种格式；evidenceIds 仍返回数字数组。
- findings 最多 6 条，acceptedClaims 最多 4 条，missingAngles 最多 4 条。
- 只输出 JSON 对象，不要输出 Markdown。`;
}

function normalizeReadingCardReviewResponse(rawResponse: string): ReviewReadingCardResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(rawResponse);
  } catch (error) {
    logAiError('reading_card.review.parse_error', error, {
      rawLength: rawResponse.length,
      rawPreview: rawResponse.slice(0, 1200),
      rawTail: rawResponse.slice(-500),
    });
    return {
      status: 'error',
      verdict: 'revise',
      summary: '审核助手返回的内容格式异常，已保留原始输出供排查。',
      findings: [
        {
          section: '整篇笔记',
          severity: 'high',
          problem: '审稿结果 JSON 解析失败，当前这位审核助手的结构化结论无法可靠读取。',
          evidenceIds: [],
        },
      ],
      acceptedClaims: [],
      missingAngles: [],
      rawResponse,
    };
  }
  return {
    verdict: parsed.verdict === 'pass' ? 'pass' : 'revise',
    summary: stringValue(parsed.summary).slice(0, 300),
    findings: Array.isArray(parsed.findings)
      ? parsed.findings.slice(0, 6).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const finding = item as Record<string, unknown>;
          const problem = stringValue(finding.problem).slice(0, 500);
          if (!problem) return [];
          return [
            {
              section: stringValue(finding.section).slice(0, 80),
              severity:
                finding.severity === 'high' || finding.severity === 'low'
                  ? finding.severity
                  : 'medium',
              problem,
              evidenceIds: numberArray(finding.evidenceIds).slice(0, 8),
              suggestedRewrite: stringValue(finding.suggestedRewrite).slice(0, 800) || undefined,
            },
          ];
        })
      : [],
    acceptedClaims: stringArray(parsed.acceptedClaims).slice(0, 4),
    missingAngles: stringArray(parsed.missingAngles).slice(0, 4),
    rawResponse,
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    throw new Error('审稿结果不是有效 JSON');
  }
}

function parseJsonArray(value: string): unknown[] {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    }
    throw new Error('助手任务拆解结果不是有效 JSON');
  }
}

function buildAnnotationMetadataPrompt(payload: AnnotationMetadataPayload) {
  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

用户选区：
${payload.anchor.exact}

用户批注：
${payload.note.trim() || '（用户未填写批注）'}

请返回 JSON 对象，字段如下：
- annotationType：只允许 key_point、assumption、concept、question、quote
- readingIntent：只允许 explain、decompose、challenge、question、connect

类型含义：
- key_point：关键判断或强论点
- assumption：前提、漏洞、可挑战处
- concept：概念解释需求
- question：延伸问题
- quote：金句或可复用表达

阅读动作含义：
- explain：解释这段在说什么
- decompose：拆解结构和因果
- challenge：挑战前提或漏洞
- question：提出后续问题
- connect：连接经验、案例或上下文

只返回 JSON，例如 {"annotationType":"key_point","readingIntent":"explain"}。`;
}

function buildAgentMentionInstructionPrompt(payload: AgentMentionInstructionPayload) {
  const agents = payload.agents.map((agent) => ({
    agentId: agent.id,
    agentUsername: agent.username,
    nickname: agent.nickname,
    personalityName: agent.personalityName,
  }));
  const intents = agentReadingIntentOptions.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
  }));

  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

目标选区：
${payload.targetAnchor.exact}

用户文本：
${payload.note.trim() || '（用户只 @ 了助手）'}

被 @ 的助手：
${JSON.stringify(agents, null, 2)}

可选阅读动作：
${JSON.stringify(intents, null, 2)}

请返回 JSON 数组，每个元素对应一个被 @ 的助手：
- agentUsername：必须来自被 @ 的助手列表
- instruction：只写这个助手需要执行的具体指令，去掉 @ 称呼
- readingIntent：当用户明确要求解释、拆解、挑战、追问或联系全文时填写对应 value；动作由助手角色自行判断时省略

拆解规则：
- 单个助手前后的要求归给该助手。
- 多个助手共享的要求复制给每个助手。
- 用户给不同助手安排不同要求时分别拆开。

只返回 JSON，例如 [{"agentUsername":"林知微","instruction":"解释这个概念","readingIntent":"explain"}]。`;
}

const ROUTE_PREVIEW_LIMIT = 180;
const ROUTE_PACK_TOKEN_BUDGET = 3600;

function buildFocusCoReadingRoutePrompt(payload: FocusCoReadingRoutePayload, agents: Agent[]) {
  const routeAgents = agents.map((agent) => ({
    agentId: agent.id,
    agentUsername: agent.username,
    nickname: agent.nickname,
    roleCard: buildAgentRoleCard(agent),
  }));
  if (payload.article.ebookIndex) {
    return buildEpubFocusCoReadingRoutePrompt(payload, agents, routeAgents);
  }

  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

可分配助手：
${JSON.stringify(routeAgents, null, 2)}

章节清单：
${JSON.stringify(webRouteSections(payload), null, 2)}

请返回 JSON 对象，字段如下：
{
  "sections": [
    {
      "sectionId": "来自章节清单的 sectionId",
      "summary": "一句话说明该章节在说什么",
      "tag": "2 到 6 个字的内容标签",
      "agentIds": ["来自可分配助手的 agentId"]
    }
  ]
}

路由规则：
- agentIds 只使用可分配助手里的 agentId。
- 每个章节可以返回空数组，也可以分配多位助手，按内容需要决定。
- 内容密度低、过渡性强、重复说明的章节可以返回空数组。
- 论证型章节优先给擅长逻辑、前提、因果和反证的助手。
- 概念型章节优先给擅长解释术语、背景和定义的助手。
- 结构型章节优先给擅长梳理全文位置和章节功能的助手。
- 沉淀型章节优先给擅长提炼要点、金句和可迁移洞见的助手。
- 分配要尊重助手角色卡，避免把所有助手集中到同一章节。

只返回 JSON。`;
}

function buildEpubFocusCoReadingRoutePrompt(
  payload: FocusCoReadingRoutePayload,
  agents: Agent[],
  routeAgents: Array<{
    agentId: string;
    agentUsername: string;
    nickname: string;
    roleCard: string;
  }>,
) {
  const routeContext = buildChapterRouteContext(payload, agents);
  const packed = packReadingContext(routeContext);
  const sections = epubRouteSections(payload);
  const contextBlocks = packed.blocks.map((block) => ({
    id: block.id,
    source: block.source,
    text: block.text,
  }));

  return `书籍标题：${payload.article.title}
作者：${payload.article.byline || '未知'}
语言：${payload.article.ebookMetadata?.language || '未知'}
出版方：${payload.article.ebookMetadata?.publisher || '未知'}
文件名：${payload.article.ebookMetadata?.fileName || '未知'}
章节数：${payload.article.ebookIndex?.chapters.length || sections.length}
全文长度：${payload.article.ebookIndex?.textLength || 0} 字符
${payload.readerGoal ? `用户共读目标：${payload.readerGoal}\n` : ''}
可分配助手：
${JSON.stringify(routeAgents, null, 2)}

章节 descriptors：
${JSON.stringify(sections, null, 2)}

压缩后的 chapter_route context：
${JSON.stringify(contextBlocks, null, 2)}

请返回 JSON 对象，字段如下：
{
  "sections": [
    {
      "sectionId": "来自章节 descriptors 的 sectionId",
      "chapterId": "来自章节 descriptors 的 chapterId",
      "chapterTitle": "来自章节 descriptors 的 chapterTitle",
      "summary": "一句话说明该章节可能承担的内容功能；信息不足时写结构判断，不要编造剧情",
      "tag": "2 到 6 个字的内容标签",
      "agentIds": ["来自可分配助手的 agentId"],
      "targetDensity": "low | medium | high",
      "needsFurtherPlanning": true
    }
  ]
}

路由规则：
- 只能基于书籍元数据、目录顺序、章节标题、章节长度、preview 和已有 summary 做章节级编排。
- 不要假装读过未提供的整章正文，也不要补写 preview 之外的情节或论证。
- agentIds 只使用可分配助手里的 agentId；字段名如果写 assignedAgentIds 也必须同样只包含这些 id。
- 每个章节可以返回空数组，也可以分配多位助手，按内容需要决定。
- 内容密度低、过渡性强、重复说明的章节可以返回空数组，并把 targetDensity 设为 low。
- preview 或已有 summary 显示章节内部跨度很大时，needsFurtherPlanning 设为 true；短章节或功能明确的章节可设为 false。
- 论证型章节优先给擅长逻辑、前提、因果和反证的助手。
- 概念型章节优先给擅长解释术语、背景和定义的助手。
- 结构型章节优先给擅长梳理全文位置和章节功能的助手。
- 沉淀型章节优先给擅长提炼要点、金句和可迁移洞见的助手。
- 分配要尊重助手角色卡，避免把所有助手集中到同一章节。

只返回 JSON。`;
}

function webRouteSections(payload: FocusCoReadingRoutePayload) {
  return payload.sections.map((section, index) => ({
    index: index + 1,
    sectionId: section.sectionId,
    sectionTitle: section.sectionTitle,
    text: compactRouteSectionText(
      payload.article.text.slice(section.sectionStart, section.sectionEnd),
    ),
  }));
}

function epubRouteSections(payload: FocusCoReadingRoutePayload) {
  const ebookIndex = payload.article.ebookIndex;
  if (!ebookIndex) return [];
  const chapters =
    ebookIndex.chapters.length > 0 ? ebookIndex.chapters : fallbackRouteChapters(payload);
  if (payload.sections.length === 0) {
    return chapters.map((chapter) =>
      epubRouteSectionDescriptor(
        payload,
        chapter,
        chapter.id,
        normalizedChapterTitle(chapter.title, chapter.indexInBook),
      ),
    );
  }
  return payload.sections.map((section, sectionIndex) => {
    const chapter = routeChapterForSection(chapters, section, sectionIndex);
    return epubRouteSectionDescriptor(payload, chapter, section.sectionId, section.sectionTitle);
  });
}

function buildChapterRouteContext(
  payload: FocusCoReadingRoutePayload,
  agents: Agent[],
): ChapterRouteContext {
  const ebookIndex = payload.article.ebookIndex as EpubBookIndex;
  const toc = epubRouteSections(payload).map<ChapterDescriptor>((section) => ({
    chapterId: section.chapterId,
    title: section.chapterTitle,
    indexInBook: section.index - 1,
    textLength: section.textLength,
    segmentCount: section.segmentCount,
    previewStart: section.previewStart,
    previewEnd: section.previewEnd,
    existingSummary: section.existingSummary,
    source: {
      type: 'toc',
      articleId: ebookIndex.articleId,
      chapterId: section.chapterId,
      source: 'epub-index',
    },
  }));
  return {
    task: 'chapter_route' as const,
    book: {
      articleId: ebookIndex.articleId,
      title: payload.article.title,
      url: payload.article.url,
      sourceType: 'ebook' as const,
      textLength: ebookIndex.textLength,
      ebookIndex,
    },
    location: {
      readerProgress: payload.readerProgress,
    },
    budget: {
      maxTokens: ROUTE_PACK_TOKEN_BUDGET,
      blockTypeOrder: ['reader_goal', 'toc', 'chapter_memory', 'agent_role'],
      reserveTokensByType: {
        agent_role: 900,
      },
    },
    evidencePolicy: {
      spoilerPolicy: payload.spoilerPolicy || {
        allowedScope: 'whole-book' as const,
        allowFutureChapterEvidence: true,
        allowFuturePlotEvents: false,
      },
      allowedSourceTypes: ['reader_goal', 'toc', 'chapter_memory', 'agent_role'],
    },
    readerGoal: payload.readerGoal,
    toc,
    agents: agents.map((agent) => ({
      agentId: agent.id,
      agentUsername: agent.username,
      nickname: agent.nickname,
      roleCard: buildAgentRoleCard(agent),
      source: {
        type: 'agent_role' as const,
        source: 'selected-agent',
      },
    })),
  };
}

function fallbackRouteChapters(payload: FocusCoReadingRoutePayload): EpubChapterIndex[] {
  return payload.sections.length > 0
    ? payload.sections.map((section, index) => ({
        id: section.sectionId,
        title: section.sectionTitle,
        indexInBook: index,
        textStart: section.sectionStart,
        textEnd: section.sectionEnd,
        textLength: Math.max(0, section.sectionEnd - section.sectionStart),
        previewStart: '',
        previewEnd: '',
        segmentIds: [],
        paragraphIds: [],
      }))
    : [
        {
          id: 'book',
          title: payload.article.title || '正文',
          indexInBook: 0,
          textStart: 0,
          textEnd: payload.article.ebookIndex?.textLength || payload.article.text.length,
          textLength: payload.article.ebookIndex?.textLength || payload.article.text.length,
          previewStart: '',
          previewEnd: '',
          segmentIds: [],
          paragraphIds: [],
        },
      ];
}

function routeChapterForSection(
  chapters: EpubChapterIndex[],
  section: FocusCoReadingRoutePayload['sections'][number],
  index: number,
) {
  return (
    chapters.find((chapter) => chapter.id === section.sectionId) ||
    chapters.find(
      (chapter) => section.sectionStart < chapter.textEnd && section.sectionEnd > chapter.textStart,
    ) ||
    chapters[index] ||
    chapters[0]
  );
}

function epubRouteSectionDescriptor(
  payload: FocusCoReadingRoutePayload,
  chapter: EpubChapterIndex,
  sectionId: string,
  sectionTitle: string,
) {
  const summary = existingChapterSummary(payload, chapter.id, sectionId);
  return {
    index: chapter.indexInBook + 1,
    sectionId,
    chapterId: chapter.id,
    chapterTitle: normalizedChapterTitle(chapter.title || sectionTitle, chapter.indexInBook),
    textLength: chapter.textLength,
    segmentCount: chapter.segmentIds.length,
    previewStart: compactRoutePreview(chapter.previewStart),
    previewEnd: compactRoutePreview(chapter.previewEnd),
    existingSummary: summary?.summary,
    existingTag: summary?.tag,
  };
}

function existingChapterSummary(
  payload: FocusCoReadingRoutePayload,
  chapterId: string,
  sectionId: string,
) {
  return payload.chapterSummaries?.find(
    (summary) => summary.chapterId === chapterId || summary.sectionId === sectionId,
  );
}

function normalizedChapterTitle(title: string, indexInBook: number) {
  const normalized = title.trim();
  return normalized || `第 ${indexInBook + 1} 章`;
}

function compactRouteSectionText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 1200) return normalized;
  return `${normalized.slice(0, 900)}……${normalized.slice(-240)}`;
}

function compactRoutePreview(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= ROUTE_PREVIEW_LIMIT) return normalized;
  return `${normalized.slice(0, ROUTE_PREVIEW_LIMIT)}…`;
}

function parseAnnotationMetadata(content: string): AnnotationMetadata {
  const parsed = parseJsonObject(content);
  const annotationType = normalizeAnnotationType(parsed.annotationType);
  const readingIntent = normalizeAgentReadingIntent(parsed.readingIntent);
  if (!annotationType || !readingIntent) throw new Error('批注标签结果无效');
  return { annotationType, readingIntent };
}

export function parseAgentMentionInstructions(
  content: string,
  agents: AgentMentionInstructionPayload['agents'],
): AgentMentionInstruction[] {
  const parsed = parseJsonArray(content);
  const byHandle = new Map(
    agents.flatMap((agent) => [[agent.username, agent] as const, [agent.nickname, agent] as const]),
  );
  const byAgentId = new Map<string, AgentMentionInstruction>();

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const handle =
      stringValue(row.agentUsername) || stringValue(row.username) || stringValue(row.agent);
    const agent = byHandle.get(handle);
    if (!agent || byAgentId.has(agent.id)) continue;
    const instruction = stringValue(row.instruction);
    const readingIntent = normalizeAgentReadingIntent(row.readingIntent);
    byAgentId.set(agent.id, {
      agentId: agent.id,
      agentUsername: agent.username,
      instruction: instruction || undefined,
      readingIntent: readingIntent || undefined,
    });
  }

  return agents.map(
    (agent) =>
      byAgentId.get(agent.id) || {
        agentId: agent.id,
        agentUsername: agent.username,
      },
  );
}

export function parseFocusCoReadingRouteResult(
  content: string,
  payload: FocusCoReadingRoutePayload,
  agents: Pick<Agent, 'id'>[],
): FocusCoReadingRouteResult {
  const parsed = parseJsonObject(content);
  const sectionRows = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sectionIds = new Set([
    ...payload.sections.map((section) => section.sectionId),
    ...(payload.article.ebookIndex
      ? epubRouteSections(payload).map((section) => section.sectionId)
      : []),
    ...(payload.article.ebookIndex?.chapters.map((chapter) => chapter.id) || []),
  ]);
  const agentIds = new Set(agents.map((agent) => agent.id));
  const seen = new Set<string>();
  const sections: FocusCoReadingRouteResult['sections'] = [];

  for (const item of sectionRows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const sectionId = stringValue(row.sectionId);
    if (!sectionId || !sectionIds.has(sectionId) || seen.has(sectionId)) continue;
    seen.add(sectionId);
    const rawAgentIds = Array.isArray(row.agentIds)
      ? row.agentIds
      : Array.isArray(row.assignedAgentIds)
        ? row.assignedAgentIds
        : [];
    const assignedAgentIds = uniqueStrings(rawAgentIds.map((value) => stringValue(value))).filter(
      (agentId) => agentIds.has(agentId),
    );
    const routeSection: FocusCoReadingRouteResult['sections'][number] = {
      sectionId,
      summary: stringValue(row.summary) || undefined,
      tag: stringValue(row.tag) || undefined,
      agentIds: assignedAgentIds,
    };
    const targetDensity = normalizeRouteTargetDensity(row.targetDensity);
    const needsFurtherPlanning = booleanValue(row.needsFurtherPlanning);
    if (targetDensity) routeSection.targetDensity = targetDensity;
    if (needsFurtherPlanning !== undefined)
      routeSection.needsFurtherPlanning = needsFurtherPlanning;
    sections.push(routeSection);
  }

  return { sections };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
}

function normalizeRouteTargetDensity(value: unknown): AgentAnnotationDensity | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text.slice(0, 500)] : [];
      })
    : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];
}
