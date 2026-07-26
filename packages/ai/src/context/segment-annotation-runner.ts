import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  Annotation,
  LlmProvider,
  ReadingMemory,
} from '@yomitomo/shared';
import { mergeReadingMemory } from '@yomitomo/core';
import {
  annotationDensityInstruction,
  annotationDensityMax,
  createAnnotationSuggestionAcceptance,
  parseAnnotationSuggestionInputs,
  type AnnotationSuggestionAcceptance,
  type AnnotationSuggestionPath,
} from '../agent/annotation-generation';
import { Effect } from 'effect';
import { extractJsonObjects, hasIncompleteJson } from '../json';
import { logAiError, logAiInfo } from '../logger';
import {
  generateYomitomoTextEffect,
  streamYomitomoTextEffect,
} from '../provider/generation-runtime';
import { generateSegmentReadingMemoryUpdateEffect } from './segment-reading-memory-update';
import {
  createSegmentAnnotationTaskRebuilder,
  segmentAnnotationContextPrompt,
  type SegmentAnnotationTask,
  type SegmentAnnotationTaskRebuilder,
} from './segment-annotation-context';
import { instructionPromptLine, readingIntentPromptLine } from '../agent/agent-runtime-prompts';

export async function runAgentSegmentAnnotate(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
) {
  return Effect.runPromise(
    runAgentSegmentAnnotateEffect(provider, agent, payload, system, segmentTasks),
  );
}

export const runAgentSegmentAnnotateEffect = Effect.fn('Segment.annotate')(function (
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
) {
  return Effect.gen(function* () {
    const annotations: Annotation[] = [];
    const acceptance = createSegmentAnnotationSuggestionAcceptance(agent, payload, 'segment_json');
    const now = new Date().toISOString();

    for (const task of segmentTasks) {
      const { text } = yield* generateYomitomoTextEffect(provider, {
        system,
        user: buildAgentSegmentAnnotatePrompt(payload, agent, task),
        maxTokens: 3000,
        temperature: agent.temperature,
      });
      for (const input of parseAnnotationSuggestionInputs(text)) {
        const result = acceptSegmentAnnotationSuggestion(
          acceptance,
          agent,
          payload,
          task,
          input,
          now,
        );
        if (result.status === 'accepted') annotations.push(result.annotation);
      }
    }

    return annotations;
  });
});

export async function runAgentSegmentAnnotateWithMemory(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
): Promise<AgentAnnotateResult> {
  return Effect.runPromise(
    runAgentSegmentAnnotateWithMemoryEffect(provider, agent, payload, system, segmentTasks),
  );
}

export const runAgentSegmentAnnotateWithMemoryEffect = Effect.fn('Segment.annotateWithMemory')(
  function (
    provider: LlmProvider,
    agent: Agent,
    payload: AgentAnnotatePayload,
    system: string,
    segmentTasks: SegmentAnnotationTask[],
  ) {
    return Effect.gen(function* () {
      const annotations: Annotation[] = [];
      const acceptance = createSegmentAnnotationSuggestionAcceptance(
        agent,
        payload,
        'segment_json',
      );
      const now = new Date().toISOString();
      let readingMemory = payload.readingMemory;
      const rebuildTask = createSegmentAnnotationTaskRebuilder(payload);

      for (const baseTask of segmentTasks) {
        const task = refreshedSegmentAnnotationTask(
          payload,
          agent,
          baseTask,
          annotations,
          readingMemory,
          rebuildTask,
        );
        const { text } = yield* generateYomitomoTextEffect(provider, {
          system,
          user: buildAgentSegmentAnnotatePrompt(payload, agent, task),
          maxTokens: 3000,
          temperature: agent.temperature,
        });
        const segmentAnnotations: Annotation[] = [];

        for (const input of parseAnnotationSuggestionInputs(text)) {
          const result = acceptSegmentAnnotationSuggestion(
            acceptance,
            agent,
            payload,
            task,
            input,
            now,
          );
          if (result.status === 'rejected') continue;
          annotations.push(result.annotation);
          segmentAnnotations.push(result.annotation);
        }

        const update = yield* generateSegmentReadingMemoryUpdateEffect(
          provider,
          agent,
          { ...payload, readingMemory },
          task,
          segmentAnnotations,
        );
        readingMemory = mergeReadingMemory(readingMemory, update);
      }

      return { annotations, readingMemory };
    });
  },
);

export async function runAgentSegmentAnnotateStreamWithMemory(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
  onAnnotation: (annotation: Annotation) => void,
): Promise<AgentAnnotateResult> {
  return Effect.runPromise(
    runAgentSegmentAnnotateStreamWithMemoryEffect(
      provider,
      agent,
      payload,
      system,
      segmentTasks,
      onAnnotation,
    ),
  );
}

export const runAgentSegmentAnnotateStreamWithMemoryEffect = Effect.fn(
  'Segment.annotateStreamWithMemory',
)(function (
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  system: string,
  segmentTasks: SegmentAnnotationTask[],
  onAnnotation: (annotation: Annotation) => void,
) {
  return Effect.gen(function* () {
    const annotations: Annotation[] = [];
    const acceptance = createSegmentAnnotationSuggestionAcceptance(
      agent,
      payload,
      'segment_ndjson',
    );
    let readingMemory = payload.readingMemory;
    const rebuildTask = createSegmentAnnotationTaskRebuilder(payload);

    for (const baseTask of segmentTasks) {
      const task = refreshedSegmentAnnotationTask(
        payload,
        agent,
        baseTask,
        annotations,
        readingMemory,
        rebuildTask,
      );
      const segmentAnnotations: Annotation[] = [];
      const flushJson = (json: string) => {
        try {
          const result = acceptSegmentAnnotationSuggestion(
            acceptance,
            agent,
            payload,
            task,
            JSON.parse(json),
          );
          if (result.status === 'rejected') return;
          annotations.push(result.annotation);
          segmentAnnotations.push(result.annotation);
          onAnnotation(result.annotation);
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

      yield* streamYomitomoTextEffect(
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

      const update = yield* generateSegmentReadingMemoryUpdateEffect(
        provider,
        agent,
        { ...payload, readingMemory },
        task,
        segmentAnnotations,
      );
      readingMemory = mergeReadingMemory(readingMemory, update);
    }

    return { annotations, readingMemory };
  });
});

function refreshedSegmentAnnotationTask(
  payload: AgentAnnotatePayload,
  agent: Agent,
  task: SegmentAnnotationTask,
  acceptedAnnotations: Annotation[],
  readingMemory: ReadingMemory | undefined,
  rebuildTask: SegmentAnnotationTaskRebuilder,
) {
  return (
    rebuildTask(
      {
        ...payload,
        annotations: [...(payload.annotations || []), ...acceptedAnnotations],
        readingMemory,
      },
      agent,
      task,
    ) || task
  );
}

function createSegmentAnnotationSuggestionAcceptance(
  agent: Agent,
  payload: AgentAnnotatePayload,
  path: Extract<AnnotationSuggestionPath, 'segment_json' | 'segment_ndjson'>,
) {
  return createAnnotationSuggestionAcceptance({
    agent,
    articleText: payload.article.text,
    path,
    dedupe: 'segment',
    existingAnnotations: payload.annotations,
    logger: logAiInfo,
  });
}

function acceptSegmentAnnotationSuggestion(
  acceptance: AnnotationSuggestionAcceptance,
  agent: Agent,
  payload: AgentAnnotatePayload,
  task: SegmentAnnotationTask,
  input: unknown,
  now?: string,
) {
  return acceptance.accept(input, {
    maxAnnotations: segmentAnnotationOutputLimit(agent, task),
    densityScope: [
      task.segment.id,
      task.createOptions.allowedTextStart,
      task.createOptions.allowedTextEnd,
    ].join(':'),
    annotationType: payload.annotationType,
    readingIntent: task.planItem.readingIntent || payload.readingIntent,
    createOptions: { ...task.createOptions, performanceLogger: logAiInfo },
    now,
    diagnosticContext: { segmentId: task.segment.id },
  });
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
