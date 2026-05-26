import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  Annotation,
  LlmProvider,
} from '@yomitomo/shared';
import { agentReadingIntentOptions, normalizeAgentReadingIntent } from '@yomitomo/shared';
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
import { budgetArticleText, formatBudgetNotice } from './budget';
import { logAiError, logAiInfo } from './logger';
import { callProviderText, streamProviderText } from './provider-client';
import {
  buildSelectionAnnotationContext,
  selectionAnnotationContextPrompt,
} from './selection-context';
import { buildSegmentAnnotationTasks } from './segment-annotation-context';
import { extractJsonObjects, hasIncompleteJson } from './json';
import { buildAgentRoleCard } from './agent-role-card';
import {
  runAgentSegmentAnnotate,
  runAgentSegmentAnnotateStreamWithMemory,
  runAgentSegmentAnnotateWithMemory,
} from './segment-annotation-runner';
import {
  instructionPromptLine,
  readingIntentPromptLine,
  readingIntentSystemPrompt,
  spoilerScopePrompt,
} from './agent-runtime-prompts';
import { memoryViewContextBlocks } from './reading-view-assembler';

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

function annotationTypePromptLine(payload: AgentAnnotatePayload) {
  return payload.annotationType ? `\n本轮批注类型：${payload.annotationType}` : '';
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

function agentAnnotationOutputLimit(
  agent: Agent,
  payload: AgentAnnotatePayload,
  context?: ReadingContextBundle,
) {
  if (payload.targetAnchor) return 1;
  return annotationDensityMax(agent.annotationDensity, annotationBudgetText(payload, context));
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
      : selectionMemoryViewPromptBlock(payload);
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
      : selectionMemoryViewPromptBlock(payload);
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${contextPrompt}\n\n目标选区：\n${payload.targetAnchor.exact}${readingIntentPromptLine(payload)}${annotationTypePromptLine(payload)}${instructionPromptLine(payload)}\n\n请针对目标选区返回 1 行 NDJSON，格式为：{"exact":"目标选区原文","type":"key_point","readingIntent":"explain","comment":"批注评论"}\n\n要求：\n- exact 必须等于目标选区原文，逐字一致\n- type 使用本轮批注类型；未指定时从 key_point、assumption、concept、question、quote 中选择\n${readingIntentOutputLine}\n${commentOutputLine}\n- 只输出 1 个 JSON 对象，不要输出 Markdown，不要输出数组。`;
  }
  const article = budgetArticleText(provider, 'agent-annotate', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{"exact":"文章中的原文连续片段","prefix":"exact 前方 10-40 个字","suffix":"exact 后方 10-40 个字","type":"key_point","comment":"按本轮阅读动作说明这段为什么值得讨论"}\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity, annotationBudgetText(payload, context))}\n\n类型只允许：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n选择标准：只挑符合本轮阅读动作且有讨论价值的文本；没有价值可以不输出任何行。\n\n要求：\n- exact 必须是文章中的原文连续片段，逐字一致\n- prefix 和 suffix 必须来自 exact 周围的文章原文，用于区分重复文本\n- type 必须从允许值中选择\n- 每发现一条值得批注的内容，就立刻输出一行 JSON\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
}
