import type {
  Agent,
  AgentAnnotatePayload,
  Annotation,
  LlmProvider,
  ReadingMemory,
  ReadingTrace,
  TextAnchor,
  TraceItem,
} from '@yomitomo/shared';
import { normalizeAnnotationConfidence, normalizeTraceItemType } from '@yomitomo/shared';
import { createEpubTextAnchor, mergeReadingMemory } from '@yomitomo/core';
import { Effect } from 'effect';
import type { SegmentAnnotationTask } from './segment-annotation-context';
import { logAiError } from '../logger';
import { callProviderTextEffect } from '../provider/provider-client';

const MEMORY_SUMMARY_MAX_TOKENS = 1400;

export async function generateSegmentReadingMemoryUpdate(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  task: SegmentAnnotationTask,
  annotations: Annotation[],
): Promise<ReadingMemory | undefined> {
  return Effect.runPromise(
    generateSegmentReadingMemoryUpdateEffect(provider, agent, payload, task, annotations),
  );
}

export const generateSegmentReadingMemoryUpdateEffect = Effect.fn('Segment.updateReadingMemory')(
  function (
    provider: LlmProvider,
    agent: Agent,
    payload: AgentAnnotatePayload,
    task: SegmentAnnotationTask,
    annotations: Annotation[],
  ) {
    return Effect.gen(function* () {
      const content = yield* callProviderTextEffect(provider, {
        system:
          '你是 Yomitomo 的内部阅读记忆压缩器。你的任务是把当前 segment 的原文摘要和阅读过程 trace 分开保存，供后续共读上下文压缩使用。只返回 JSON。',
        user: buildSegmentReadingMemoryPrompt(agent, task, annotations),
        maxTokens: MEMORY_SUMMARY_MAX_TOKENS,
        temperature: 0,
      });
      return yield* Effect.try({
        try: () => parseSegmentReadingMemoryUpdate(content, payload, task, agent, annotations),
        catch: (error) => error,
      });
    }).pipe(
      Effect.catch((error) => {
        logAiError('agent.segment_memory.update_failed', error, {
          agent: agent.username,
          segmentId: task.segment.id,
        });
        return Effect.succeed(undefined);
      }),
    );
  },
);

function buildSegmentReadingMemoryPrompt(
  agent: Agent,
  task: SegmentAnnotationTask,
  annotations: Annotation[],
) {
  return `请更新当前 segment 的最小阅读记忆。

输入：
${JSON.stringify(
  {
    chapter: {
      chapterId: task.chapter.id,
      title: task.chapter.title,
      sourceRange: {
        textStart: task.chapter.textStart,
        textEnd: task.chapter.textEnd,
      },
    },
    currentSegment: {
      segmentId: task.segment.id,
      sourceRange: task.context.currentSegment.textRange,
      text: task.context.currentSegment.text,
    },
    previousSummary: task.context.previousMemory?.summary || '',
    previousSegmentTrace: task.context.previousTrace?.events || [],
    chapterTrace: task.context.chapterTrace?.events || [],
    routeInstruction: {
      sectionSummary: task.planItem.sectionSummary || '',
      sectionTag: task.planItem.sectionTag || '',
      readingIntent: task.planItem.readingIntent || '',
      readerMessages: task.planItem.messages || [],
    },
    assistant: {
      agentId: agent.id,
      username: agent.username,
      nickname: agent.nickname,
    },
    acceptedAnnotations: annotations.map((annotation) => ({
      annotationId: annotation.id,
      exact: annotation.anchor.exact,
      moveType: annotation.moveType || '',
      whyHere: annotation.whyHere || '',
      comment: annotation.comments[0]?.content || '',
      confidence: annotation.confidence || '',
    })),
  },
  null,
  2,
)}

输出 JSON：
{
  "segmentSummary": {
    "summary": "用 1-3 句概括 currentSegment 原文说了什么，不写读者/助手反应",
    "keyTerms": ["最多 8 个关键词"]
  },
  "segmentTrace": {
    "items": [
      {
        "type": "claim | question | agent_observation | reader_interest | cross_reference_candidate",
        "content": "我们读到这里时注意过什么，短句",
        "evidenceExact": "currentSegment 中支撑该关注点的原文短片段，可为空",
        "confidence": "low | medium | high"
      }
    ]
  },
  "chapterTrace": {
    "items": [
      {
        "type": "claim | question | agent_observation | reader_interest | cross_reference_candidate",
        "content": "需要带入后续 segment 的章节级关注点，短句",
        "evidenceExact": "currentSegment 中支撑该关注点的原文短片段，可为空",
        "confidence": "low | medium | high"
      }
    ]
  }
}

规则：
- summary 只回答原文说了什么；trace 只回答我们读到这里时注意过什么，两者不能混写。
- trace 要短、结构化、可被后续覆盖；不要复述整段。
- 没有批注时仍然可以写 segmentSummary，trace items 可以为空。
- 不要把 previousSummary 或 trace 当作原文事实来源；涉及作者观点或关键概念出处时，只能依据 currentSegment。
- 只返回 JSON，不要输出 Markdown。`;
}

function parseSegmentReadingMemoryUpdate(
  content: string,
  payload: AgentAnnotatePayload,
  task: SegmentAnnotationTask,
  agent: Agent,
  annotations: Annotation[],
) {
  const parsed = parseJsonObject(content);
  const now = new Date().toISOString();
  const segmentSummary = objectValue(parsed.segmentSummary);
  const summaryText = stringValue(segmentSummary.summary || parsed.summary).slice(0, 700);
  const keyTerms = stringArray(segmentSummary.keyTerms || parsed.keyTerms).slice(0, 8);
  const sourceRange = task.context.currentSegment.textRange || {
    textStart: task.segment.textStart,
    textEnd: task.segment.textEnd,
  };
  const segmentItems = parseTraceItems(
    objectArray(objectValue(parsed.segmentTrace).items || parsed.traceItems),
    payload,
    task,
    agent,
    annotations,
  );
  const chapterItems = parseTraceItems(
    objectArray(objectValue(parsed.chapterTrace).items),
    payload,
    task,
    agent,
    annotations,
  );
  const readingTraces: ReadingTrace[] = [];

  if (segmentItems.length > 0) {
    readingTraces.push({
      scope: 'segment',
      sourceRange,
      chapterId: task.chapter.id,
      segmentId: task.segment.id,
      agentId: agent.id,
      items: segmentItems,
      updatedAt: now,
    });
  }
  if (chapterItems.length > 0 || segmentItems.length > 0) {
    readingTraces.push({
      scope: 'chapter',
      sourceRange: {
        textStart: task.chapter.textStart,
        textEnd: task.chapter.textEnd,
      },
      chapterId: task.chapter.id,
      agentId: agent.id,
      items: chapterItems.length > 0 ? chapterItems : segmentItems,
      updatedAt: now,
    });
  }

  return mergeReadingMemory(undefined, {
    textSummaries: summaryText
      ? [
          {
            scope: 'segment',
            sourceRange,
            chapterId: task.chapter.id,
            segmentId: task.segment.id,
            summary: summaryText,
            keyTerms,
            updatedAt: now,
          },
        ]
      : [],
    readingTraces,
    updatedAt: now,
  });
}

function parseTraceItems(
  rawItems: Array<Record<string, unknown>>,
  payload: AgentAnnotatePayload,
  task: SegmentAnnotationTask,
  agent: Agent,
  annotations: Annotation[],
): TraceItem[] {
  return rawItems
    .flatMap((item) => {
      const content = stringValue(item.content).slice(0, 280);
      if (!content) return [];
      const type = normalizeTraceItemType(item.type) || 'agent_observation';
      return [
        {
          type,
          content,
          evidenceAnchors: evidenceAnchors(item, payload, task, annotations),
          agentId: agent.id,
          confidence: normalizeAnnotationConfidence(item.confidence) || 'medium',
          createdFromTask: 'chapter_segment_annotation',
        },
      ];
    })
    .slice(0, 8);
}

function evidenceAnchors(
  item: Record<string, unknown>,
  payload: AgentAnnotatePayload,
  task: SegmentAnnotationTask,
  annotations: Annotation[],
): TextAnchor[] {
  const anchors = stringArray(item.evidenceExacts)
    .concat(stringValue(item.evidenceExact))
    .flatMap((exact) => evidenceAnchorFromExact(exact, payload, task));
  if (anchors.length > 0) return anchors.slice(0, 3);

  const annotationId = stringValue(item.annotationId);
  const annotation =
    annotations.find((candidate) => candidate.id === annotationId) || annotations[0];
  return annotation ? [annotation.anchor] : [];
}

function evidenceAnchorFromExact(
  exact: string,
  payload: AgentAnnotatePayload,
  task: SegmentAnnotationTask,
): TextAnchor[] {
  if (!exact.trim() || !payload.article.ebookIndex) return [];
  const localIndex = task.context.currentSegment.text.indexOf(exact);
  if (localIndex < 0 || !task.context.currentSegment.textRange) return [];
  const textStart = task.context.currentSegment.textRange.textStart + localIndex;
  return [
    createEpubTextAnchor(
      payload.article.ebookIndex,
      payload.article.text,
      textStart,
      textStart + exact.length,
    ),
  ];
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
    throw new Error('READING_MEMORY_JSON_PARSE_FAILED');
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap((item) => [objectValue(item)]) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text] : [];
      })
    : [];
}
