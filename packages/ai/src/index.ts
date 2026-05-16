import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMessagePayload,
  Annotation,
  Comment,
  FocusCoReadingRoutePayload,
  FocusCoReadingRouteResult,
  LlmProvider,
  ReadingMemory,
} from '@yomitomo/shared';
import { agentReadingIntentOptions, normalizeAgentReadingIntent } from '@yomitomo/shared';
import {
  annotationDensityInstruction,
  annotationDensityMax,
  buildCurrentChapterLexicalRelatedPassages,
  buildReadingContextBundle,
  createAgentAnnotation,
  mergeReadingMemory,
  normalizeAnnotationType,
  parseAnnotationSuggestions,
  readingContextTextForRange,
  selectionThreadSpoilerPolicy,
  wholeBookSpoilerPolicy,
  type AnnotationSuggestion,
  type ReadingContextBundle,
} from '@yomitomo/core';
import { logAiError, logAiInfo } from './logger';
import { budgetArticleText, formatBudgetNotice } from './budget';
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
import { extractJsonObjects, hasIncompleteJson } from './json';
import { buildAgentRoleCard, type PromptAgent } from './agent-role-card';
import { buildFocusCoReadingRoutePrompt, parseFocusCoReadingRouteResult } from './focus-route';

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
export { extractJsonObjects } from './json';
export { parseFocusCoReadingRouteResult } from './focus-route';
export {
  inferAnnotationMetadata,
  parseAgentMentionInstructions,
  planAgentMentionInstructions,
} from './annotation-metadata';
export {
  generateReadingCard,
  generateReadingDeliberation,
  reviewReadingCard,
  type GenerateReadingCardInput,
  type GenerateReadingDeliberationInput,
  type ReviewReadingCardInput,
  type ReviewReadingCardResult,
} from './reading-card';

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
      { ebookIndex: payload.article.ebookIndex, performanceLogger: logAiInfo },
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
        { ebookIndex: payload.article.ebookIndex, performanceLogger: logAiInfo },
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
    { ...task.createOptions, performanceLogger: logAiInfo },
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

type PromptAgentIdentity = {
  username?: string;
  nickname?: string;
};

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
    performanceLogger: logAiInfo,
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
    performanceLogger: logAiInfo,
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
