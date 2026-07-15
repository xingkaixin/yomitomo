import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  Annotation,
  LlmProvider,
} from '@yomitomo/shared';
import {
  agentReadingIntentOptions,
  normalizeAgentReadingIntent,
  resolvePromptAgentIdentity,
} from '@yomitomo/shared';
import {
  annotationDensityInstruction,
  annotationDensityMax,
  buildCurrentChapterLexicalRelatedPassages,
  buildReadingContextBundle,
  createAgentAnnotation,
  normalizeAnnotationType,
  parseAnnotationSuggestions,
  readingContextTextForRange,
  wholeBookSpoilerPolicy,
  type ReadingContextBundle,
} from '@yomitomo/core';
import { Effect } from 'effect';
import { budgetArticleText, formatBudgetNotice } from '../provider/budget';
import { logAiError, logAiInfo } from '../logger';
import { callProviderTextEffect, streamProviderTextEffect } from '../provider/provider-client';
import type { NormalizedAiUsage } from '../provider/usage';
import {
  buildSelectionAnnotationContext,
  selectionAnnotationContextPrompt,
} from '../context/selection-context';
import { buildSegmentAnnotationTasks } from '../context/segment-annotation-context';
import { extractJsonObjects, hasIncompleteJson } from '../json';
import { buildAgentRoleCard } from './agent-role-card';
import {
  runAgentSegmentAnnotateEffect,
  runAgentSegmentAnnotateStreamWithMemoryEffect,
  runAgentSegmentAnnotateWithMemoryEffect,
} from '../context/segment-annotation-runner';
import {
  instructionPromptLine,
  readingAssistantPrinciplesPrompt,
  readingIntentPromptLine,
  readingIntentSystemPrompt,
  spoilerScopePrompt,
} from './agent-runtime-prompts';
import { memoryViewContextBlocks } from '../context/reading-view-assembler';
import { responseLanguageSystemPrompt } from './agent-language';

export async function runAgentAnnotate(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
): Promise<Annotation[]> {
  return Effect.runPromise(runAgentAnnotateEffect(provider, agent, payload));
}

export const runAgentAnnotateEffect = Effect.fn('Agent.annotate')(function (
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
) {
  return Effect.gen(function* () {
    const system = buildAgentAnnotateSystemPrompt(agent, payload);
    const segmentTasks = buildSegmentAnnotationTasks(payload, agent);
    if (segmentTasks.length > 0) {
      return yield* runAgentSegmentAnnotateEffect(provider, agent, payload, system, segmentTasks);
    }
    const context = buildAgentAnnotateContextBundle(payload);
    const content = yield* callProviderTextEffect(provider, {
      system,
      user: buildAgentAnnotationPrompt('json', { provider, payload, agent, context }),
      maxTokens: 4000,
      temperature: agent.temperature,
    });
    const suggestions = parseAnnotationSuggestions(content);
    const now = new Date().toISOString();
    const maxAnnotations = agentAnnotationOutputLimit(agent, payload, context);
    const annotations: Annotation[] = [];
    const deduper = createAnnotationThoughtDeduper(payload);

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
      if (!annotation) continue;
      if (!deduper.accept(annotation)) {
        logAiInfo('agent.annotate.skip', {
          agent: agent.username,
          reason: 'duplicate_existing_thought',
          exactPreview: annotation.anchor.exact.slice(0, 120),
        });
        continue;
      }
      annotations.push(annotation);
    }

    return annotations;
  });
});

export async function runAgentAnnotateWithMemory(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
): Promise<AgentAnnotateResult> {
  return Effect.runPromise(runAgentAnnotateWithMemoryEffect(provider, agent, payload));
}

export const runAgentAnnotateWithMemoryEffect = Effect.fn('Agent.annotateWithMemory')(function (
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
) {
  return Effect.gen(function* () {
    const system = buildAgentAnnotateSystemPrompt(agent, payload);
    const segmentTasks = buildSegmentAnnotationTasks(payload, agent);
    if (segmentTasks.length > 0) {
      return yield* runAgentSegmentAnnotateWithMemoryEffect(
        provider,
        agent,
        payload,
        system,
        segmentTasks,
      );
    }
    return {
      annotations: yield* runAgentAnnotateEffect(provider, agent, payload),
      readingMemory: payload.readingMemory,
    };
  });
});

export function buildAgentSelectionRuntimePayload(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
) {
  const runtimePayload = {
    ...payload,
    readingMemoryView: undefined,
  };
  const context = buildAgentAnnotateContextBundle(runtimePayload);
  return {
    system: `${buildAgentAnnotateSystemPrompt(agent, runtimePayload)}\n\n你现在通过 assistant tool runtime 决定是否给目标选区添加批注。工具调用由 API tools 协议完成；如果需要上下文，调用可用工具。最终回答只能是一个 action JSON，type 为 \`add_annotation\` 或 \`no_action\`，不要返回普通 JSON 数组或自然语言正文。`,
    user: `${buildAgentAnnotationPrompt('json', { provider, payload: runtimePayload, agent, context })}\n\n最终 action 要求：\n- 如果目标选区值得添加新想法，type 为 "add_annotation"。\n- 不要输出 anchor；本轮目标选区由宿主代码负责写入。\n- thought 是将写入批注评论的内容。\n- 如果证据不足、目标选区没有讨论价值或和既有想法重复，type 为 "no_action"。\n- evidenceIds 只能引用本轮工具返回的 evidence id；没有历史证据时不要编造历史断言。\n- confidence 使用 0 到 1 的数字。\n- reason 用一句话说明动作决策理由。`,
    maxTokens: 1200,
    temperature: agent.temperature,
  };
}

export function buildAgentCoReadingRuntimePayload(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  candidate: Annotation,
) {
  const runtimePayload = {
    ...payload,
    readingMemoryView: undefined,
  };
  const context = buildAgentAnnotateContextBundle(runtimePayload);
  const primaryComment = candidate.comments[0]?.content || '';
  return {
    system: `${buildAgentAnnotateSystemPrompt(agent, runtimePayload)}\n\n你现在通过 assistant tool runtime 复核定向阅读流程已经生成的一条候选批注。工具调用由 API tools 协议完成；如果需要上下文，调用可用工具。最终回答只能是一个 action JSON，type 为 \`add_annotation\` 或 \`no_action\`，不要返回普通 JSON 数组或自然语言正文。`,
    user: `${buildAgentAnnotationPrompt('json', { provider, payload: runtimePayload, agent, context })}\n\n候选批注：\n${JSON.stringify(
      {
        exact: candidate.anchor.exact,
        comment: primaryComment,
        annotationType: candidate.annotationType,
        readingIntent: candidate.readingIntent,
        moveType: candidate.moveType,
        whyHere: candidate.whyHere,
        confidence: candidate.confidence,
      },
      null,
      2,
    )}\n\n最终 action 要求：\n- 如果候选批注提供了新的、有价值的共读想法，type 为 "add_annotation"。\n- 不要输出 anchor；候选批注 anchor 由宿主代码负责保留。\n- thought 使用候选 comment，可在不改变含义的前提下做轻微收紧。\n- 如果候选和既有想法重复、证据不足、或只是在泛泛摘要，type 为 "no_action"。\n- evidenceIds 只能引用本轮工具返回的 evidence id。\n- confidence 使用 0 到 1 的数字。\n- reason 用一句话说明保留或过滤理由。`,
    maxTokens: 1200,
    temperature: agent.temperature,
  };
}

export async function runAgentAnnotateStream(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  onAnnotation: (annotation: Annotation) => void,
): Promise<AgentAnnotateResult & { usage?: NormalizedAiUsage }> {
  return Effect.runPromise(runAgentAnnotateStreamEffect(provider, agent, payload, onAnnotation));
}

export const runAgentAnnotateStreamEffect = Effect.fn('Agent.annotateStream')(function (
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  onAnnotation: (annotation: Annotation) => void,
) {
  return Effect.gen(function* () {
    const system = buildAgentAnnotateSystemPrompt(agent, payload);
    const segmentTasks = buildSegmentAnnotationTasks(payload, agent);
    if (segmentTasks.length > 0) {
      return yield* runAgentSegmentAnnotateStreamWithMemoryEffect(
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
    const deduper = createAnnotationThoughtDeduper(payload);
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
            readingIntent:
              payload.readingIntent || normalizeAgentReadingIntent(parsed.readingIntent),
            ...targetAnchorSuggestion(payload),
          },
          new Date().toISOString(),
          { ebookIndex: payload.article.ebookIndex, performanceLogger: logAiInfo },
        );
        if (!annotation) {
          logAiInfo('agent.annotate.skip', {
            agent: agent.username,
            reason: 'exact_not_found',
            exactPreview: exact.slice(0, 120),
          });
          return;
        }
        if (!deduper.accept(annotation)) {
          logAiInfo('agent.annotate.skip', {
            agent: agent.username,
            reason: 'duplicate_existing_thought',
            exactPreview: exact.slice(0, 120),
          });
          return;
        }
        annotationCount += 1;
        annotations.push(annotation);
        onAnnotation(annotation);
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

    const generation = yield* streamProviderTextEffect(
      provider,
      {
        system,
        user: buildAgentAnnotationPrompt('ndjson', { provider, payload, agent, context }),
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
    return { annotations, readingMemory: payload.readingMemory, usage: generation.usage };
  });
});

function annotationTypePromptLine(payload: AgentAnnotatePayload) {
  return payload.annotationType ? `\n本轮批注类型：${payload.annotationType}` : '';
}

function buildAgentAnnotateSystemPrompt(agent: Agent, payload: AgentAnnotatePayload) {
  const identity = resolvePromptAgentIdentity(agent, payload.uiLanguage);
  const username = identity.username || agent.username;
  const scope = payload.targetAnchor
    ? `你正在作为网页阅读器里的 @${username} 对读者选中的文本创建批注。批注以目标选区为锚点，可以参考提供的局部上下文，但只围绕目标选区本身展开。`
    : `你正在作为网页阅读器里的 @${username} 主动阅读文章并创建批注。只标出真正值得讨论的原文片段：金句、关键判断、强论点、反常规观点、潜在漏洞、值得追问的前提、与读者决策相关的信息。平平无奇的句子直接跳过。`;
  return `${buildAgentRoleCard(agent, payload.uiLanguage)}\n\n${scope}${readingAssistantPrinciplesPrompt(payload.uiLanguage)}${readingIntentSystemPrompt(payload)}${responseLanguageSystemPrompt(payload.uiLanguage)}`;
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

function createAnnotationThoughtDeduper(payload: AgentAnnotatePayload) {
  if (payload.targetAnchor || !payload.readingPlan?.length) {
    return { accept: () => true };
  }

  const accepted = (payload.annotations || []).flatMap((annotation) => {
    const item = annotationThoughtDedupItem(payload.article.text, annotation);
    return item ? [item] : [];
  });

  return {
    accept(annotation: Annotation) {
      const item = annotationThoughtDedupItem(payload.article.text, annotation);
      if (!item) return true;
      if (accepted.some((existing) => annotationThoughtsDuplicate(existing, item))) return false;
      accepted.push(item);
      return true;
    },
  };
}

type AnnotationThoughtDedupItem = {
  exactKey: string;
  textStart: number;
  textEnd: number;
  comments: string[];
};

function annotationThoughtDedupItem(
  articleText: string,
  annotation: Annotation,
): AnnotationThoughtDedupItem | null {
  const textStart =
    integerValue(annotation.anchor.textStartInBook) ?? integerValue(annotation.anchor.start);
  const textEnd =
    integerValue(annotation.anchor.textEndInBook) ?? integerValue(annotation.anchor.end);
  if (textStart === null || textEnd === null || textEnd <= textStart) return null;

  const comments = annotation.comments
    .map((comment) => normalizeThoughtText(comment.content))
    .filter((comment) => comment.length >= 12);
  return {
    exactKey: normalizeThoughtText(
      annotation.anchor.exact || articleText.slice(textStart, textEnd),
    ),
    textStart,
    textEnd,
    comments,
  };
}

function annotationThoughtsDuplicate(
  left: AnnotationThoughtDedupItem,
  right: AnnotationThoughtDedupItem,
) {
  if (!sameAnnotationAnchor(left, right)) return false;
  if (left.comments.length === 0 || right.comments.length === 0)
    return left.exactKey === right.exactKey;

  return left.comments.some((leftComment) =>
    right.comments.some((rightComment) => thoughtTextsSimilar(leftComment, rightComment)),
  );
}

function sameAnnotationAnchor(
  left: Pick<AnnotationThoughtDedupItem, 'exactKey' | 'textStart' | 'textEnd'>,
  right: Pick<AnnotationThoughtDedupItem, 'exactKey' | 'textStart' | 'textEnd'>,
) {
  if (left.exactKey && left.exactKey === right.exactKey) return true;
  return textRangeDistance(left, right) <= 16;
}

function thoughtTextsSimilar(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  if (shorter.length >= 24 && longer.includes(shorter)) return true;
  return diceCoefficient(characterBigrams(left), characterBigrams(right)) >= 0.58;
}

function characterBigrams(text: string) {
  if (text.length <= 1) return new Set(text ? [text] : []);
  const grams = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return (2 * overlap) / (left.size + right.size);
}

function normalizeThoughtText(text: string) {
  return text.replace(/[\s"'“”‘’`，。！？、；：,.!?;:—\-（）()[\]{}]/g, '').toLowerCase();
}

function textRangeDistance(
  left: Pick<AnnotationThoughtDedupItem, 'textStart' | 'textEnd'>,
  right: Pick<AnnotationThoughtDedupItem, 'textStart' | 'textEnd'>,
) {
  if (left.textStart < right.textEnd && right.textStart < left.textEnd) return 0;
  if (left.textEnd <= right.textStart) return right.textStart - left.textEnd;
  return left.textStart - right.textEnd;
}

function integerValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
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

  return `\n\n本轮定向阅读范围：\n${JSON.stringify(plan, null, 2)}\n\n范围要求：\n- 你只能使用本轮提供的可用原文范围理解上下文。\n- 只在列表里的 sectionText 内选择批注片段。\n- sectionSummary 和 sectionTag 用于帮助你快速定位章节重点。\n- readerMessages 是读者给本章节或给你的留言，请作为阅读关注点。\n- readingIntent 为空时，你根据原文、留言和角色卡自行选择每条批注的 readingIntent。\n- readingIntent 有值时，每条批注使用该章节对应的 readingIntent。\n- 输出的 exact 必须来自对应 sectionText 的连续原文。\n- 没有讨论价值的章节可以不输出。`;
}

function selectionAnnotationPromptBlock(
  payload: AgentAnnotatePayload,
  agent: Agent,
  context: ReadingContextBundle,
) {
  const selectionContext = buildSelectionAnnotationContext(payload, agent, context);
  return selectionContext ? selectionAnnotationContextPrompt(selectionContext) : '';
}

function selectionMemoryViewPromptBlock(payload: AgentAnnotatePayload) {
  if (payload.article.ebookIndex) return '';
  const blocks = memoryViewContextBlocks(payload.readingMemoryView);
  if (blocks.length === 0) return '';
  return `\n\nselection memory_view：\n${JSON.stringify(
    blocks.map((block) => ({
      id: block.id,
      source: block.source,
      text: block.text,
    })),
    null,
    2,
  )}\n\nmemory_view 使用规则：\n- memory_view 是同篇文章内已有批注、讨论和共读记忆，只能作为理解读者/助手已有关注点的背景。\n- 批注锚点仍必须保持为目标选区本身，不能扩展到 memory_view 里的其他句子。\n- 如果 memory_view 与目标选区无关，忽略它。`;
}

function articleSectionMemoryViewPromptBlock(payload: AgentAnnotatePayload) {
  if (payload.article.ebookIndex) return '';
  const blocks = memoryViewContextBlocks(payload.readingMemoryView);
  if (blocks.length === 0) return '';
  return `\n\narticle-section memory_view：\n${JSON.stringify(
    blocks.map((block) => ({
      id: block.id,
      source: block.source,
      text: block.text,
    })),
    null,
    2,
  )}\n\nmemory_view 使用规则：\n- memory_view 是同篇文章内已有批注、讨论和共读记忆，只能作为理解本轮 section 的相关背景。\n- 批注 exact 仍必须来自编排列表里的 sectionText，不能从 memory_view 里选择锚点。\n- 如果同一原文位置已有相同或高度相似的想法，不要重复输出；只有能提供明显不同的新角度时才继续批注。\n- 如果 memory_view 与本轮 section 无关，忽略它。`;
}

function agentAnnotationOutputLimit(
  agent: Agent,
  payload: AgentAnnotatePayload,
  context?: ReadingContextBundle,
) {
  if (payload.targetAnchor) return 1;
  return annotationDensityMax(agent.annotationDensity, annotationBudgetText(payload, context));
}

type AgentAnnotationOutputFormat = 'json' | 'ndjson';

type AgentAnnotationPromptMode = 'reading-plan' | 'selection' | 'whole-article';

type AgentAnnotationPromptInput = {
  provider: LlmProvider;
  payload: AgentAnnotatePayload;
  agent: Agent;
  context?: ReadingContextBundle;
};

const ANNOTATION_TYPE_MEANINGS = `类型含义：
- key_point：关键判断或强论点
- assumption：前提、漏洞、可挑战处
- concept：概念解释需求
- question：值得追问的问题
- quote：金句或可复用表达`;

const MULTI_ANNOTATION_OUTPUT_FRAMING = {
  json: `请返回 JSON 数组，每个元素是一条完整批注。没有值得批注的内容时返回空数组。

只返回 JSON，不要输出 Markdown。`,
  ndjson: `请用 NDJSON 返回批注，每一行是一个完整 JSON 对象。每发现一条值得批注的内容，就立刻输出一行；没有值得批注的内容时不输出任何行。

只输出 NDJSON，不要输出 Markdown，不要输出数组。`,
} as const;

const ANNOTATION_OUTPUT_FRAMING = {
  'reading-plan': MULTI_ANNOTATION_OUTPUT_FRAMING,
  selection: {
    json: `请针对目标选区返回 JSON 数组，数组中只放 1 个完整批注对象。

只返回 JSON，不要输出 Markdown。`,
    ndjson: `请针对目标选区返回 1 行 NDJSON，即 1 个完整 JSON 对象。

只输出 1 个 JSON 对象，不要输出 Markdown，不要输出数组。`,
  },
  'whole-article': MULTI_ANNOTATION_OUTPUT_FRAMING,
} as const satisfies Record<AgentAnnotationPromptMode, Record<AgentAnnotationOutputFormat, string>>;

export function buildAgentAnnotationPrompt(
  outputFormat: AgentAnnotationOutputFormat,
  input: AgentAnnotationPromptInput,
) {
  const context = input.context ?? buildAgentAnnotateContextBundle(input.payload);
  const mode = agentAnnotationPromptMode(input.payload);
  return `${agentAnnotationContextPrompt(mode, input, context)}\n\n${agentAnnotationSemanticsPrompt(mode, input.payload, input.agent, context)}\n\n## 输出格式\n${ANNOTATION_OUTPUT_FRAMING[mode][outputFormat]}`;
}

function agentAnnotationPromptMode(payload: AgentAnnotatePayload): AgentAnnotationPromptMode {
  if (payload.readingPlan?.length) return 'reading-plan';
  if (payload.targetAnchor) return 'selection';
  return 'whole-article';
}

function agentAnnotationContextPrompt(
  mode: AgentAnnotationPromptMode,
  input: AgentAnnotationPromptInput,
  context: ReadingContextBundle,
) {
  const { provider, payload, agent } = input;
  if (mode === 'selection') {
    const selectionContext = payload.article.ebookIndex
      ? `${selectionAnnotationPromptBlock(payload, agent, context)}${spoilerScopePrompt(context)}`
      : selectionMemoryViewPromptBlock(payload);
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${selectionContext}\n\n目标选区：\n${payload.targetAnchor?.exact || ''}${readingIntentPromptLine(payload)}${annotationTypePromptLine(payload)}${instructionPromptLine(payload)}`;
  }

  const article = budgetArticleText(provider, 'agent-annotate', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);
  const modeContext =
    mode === 'reading-plan'
      ? `${readingPlanPrompt(payload, context)}${articleSectionMemoryViewPromptBlock(payload)}`
      : readingIntentPromptLine(payload);
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${modeContext}${spoilerScopePrompt(context)}`;
}

function agentAnnotationSemanticsPrompt(
  mode: AgentAnnotationPromptMode,
  payload: AgentAnnotatePayload,
  agent: Agent,
  context: ReadingContextBundle,
) {
  if (mode === 'reading-plan') {
    return `## 批注语义
每条批注包含：
- exact：必须是对应 sectionText 中的连续原文，逐字一致
- prefix：exact 前方 10-40 个字，来自文章原文
- suffix：exact 后方 10-40 个字，来自文章原文
- type：只允许 key_point、assumption、concept、question、quote
- readingIntent：章节 readingIntent 有值时必须等于该值；为空时，从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作
- comment：结合章节内容、读者留言和你的角色判断写给读者的批注评论

批注密度：${annotationDensityInstruction(agent.annotationDensity, annotationBudgetText(payload, context))}

${ANNOTATION_TYPE_MEANINGS}

选择标准：跳过已被已有批注或 memory_view 充分覆盖的原文位置；不要用不同措辞重复同一个想法。`;
  }

  if (mode === 'selection') {
    const readingIntentRule = payload.readingIntent
      ? '必须等于本轮阅读动作的值'
      : '从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作';
    const commentRule = payload.readingIntent
      ? '按本轮阅读动作和读者指导写给读者的批注评论'
      : '按读者指导和你的角色判断写给读者的批注评论';
    return `## 批注语义
批注包含：
- exact：必须等于目标选区原文，逐字一致
- type：使用本轮批注类型；未指定时只允许 key_point、assumption、concept、question、quote
- readingIntent：${readingIntentRule}
- comment：${commentRule}`;
  }

  return `## 批注语义
每条批注包含：
- exact：必须是文章中的连续原文片段，逐字一致
- prefix：exact 前方 10-40 个字，来自文章原文
- suffix：exact 后方 10-40 个字，来自文章原文
- type：只允许 key_point、assumption、concept、question、quote
- comment：按本轮阅读动作说明这段为什么值得讨论，作为批注里的第一条评论

批注密度：${annotationDensityInstruction(agent.annotationDensity, annotationBudgetText(payload, context))}

${ANNOTATION_TYPE_MEANINGS}

选择标准：只挑符合本轮阅读动作且有讨论价值的文本。`;
}
