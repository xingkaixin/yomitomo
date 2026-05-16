import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  Annotation,
  LlmProvider,
  ReadingMemory,
} from '@yomitomo/shared';
import {
  annotationDensityInstruction,
  annotationDensityMax,
  createAgentAnnotation,
  mergeReadingMemory,
  parseAnnotationSuggestions,
  type AnnotationSuggestion,
} from '@yomitomo/core';
import { extractJsonObjects, hasIncompleteJson } from './json';
import { logAiError, logAiInfo } from './logger';
import { callProviderText, streamProviderText } from './provider-client';
import { generateSegmentReadingMemoryUpdate } from './reading-memory';
import {
  buildSegmentAnnotationTask,
  segmentAnnotationContextPrompt,
  type SegmentAnnotationTask,
} from './segment-annotation-context';
import { instructionPromptLine, readingIntentPromptLine } from './agent-runtime-prompts';

export async function runAgentSegmentAnnotate(
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

export async function runAgentSegmentAnnotateWithMemory(
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

export async function runAgentSegmentAnnotateStreamWithMemory(
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
