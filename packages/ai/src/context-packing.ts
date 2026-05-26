import type {
  BaseReadingContext,
  BudgetPolicy,
  ContextSourceLabel,
  ContextSourceType,
  ReadingTaskContext,
  SourceLabeledContextBlock,
  TextAnchor,
} from '@yomitomo/shared';

export type TokenEstimator = (text: string) => number;

export type PackedContextBlock = SourceLabeledContextBlock & {
  tokenEstimate: number;
  originalTokenEstimate: number;
  truncated: boolean;
};

export type OmittedContextBlock = {
  block: SourceLabeledContextBlock;
  reason: 'empty_text' | 'budget_exhausted';
};

export type PackedReadingContext = {
  blocks: PackedContextBlock[];
  omittedBlocks: OmittedContextBlock[];
  usedTokens: number;
  maxTokens: number;
};

export type PackReadingContextOptions = {
  estimateTokens?: TokenEstimator;
};

export function packReadingContext(
  context: ReadingTaskContext,
  options: PackReadingContextOptions = {},
): PackedReadingContext {
  const allowedTypes = context.evidencePolicy.allowedSourceTypes;
  const blocks = collectReadingContextBlocks(context).filter(
    (block) => !allowedTypes || allowedTypes.includes(block.source.type),
  );
  return packReadingContextBlocks(blocks, context.budget, options);
}

export function packReadingContextBlocks(
  blocks: SourceLabeledContextBlock[],
  budget: BudgetPolicy,
  options: PackReadingContextOptions = {},
): PackedReadingContext {
  const estimateTokens = options.estimateTokens || defaultTokenEstimator;
  const maxTokens = normalizeTokenBudget(budget.maxTokens);
  const orderedBlocks = orderBlocks(blocks, budget.blockTypeOrder);
  const blockTypes = uniqueBlockTypes(orderedBlocks);
  const packed: PackedContextBlock[] = [];
  const omittedBlocks: OmittedContextBlock[] = [];
  let usedTokens = 0;

  for (let index = 0; index < blockTypes.length; index += 1) {
    const type = blockTypes[index];
    const remaining = maxTokens - usedTokens;
    const typeBudget = availableTokensForType(type, blockTypes.slice(index + 1), remaining, budget);
    const typeBlocks = orderedBlocks.filter((block) => block.source.type === type);
    const packedType = packBlockType(typeBlocks, typeBudget, estimateTokens);

    packed.push(...packedType.blocks);
    omittedBlocks.push(...packedType.omittedBlocks);
    usedTokens += packedType.usedTokens;
  }

  return {
    blocks: packed,
    omittedBlocks,
    usedTokens,
    maxTokens,
  };
}

export function collectReadingContextBlocks(context: ReadingTaskContext) {
  if (context.task === 'selection_annotation') {
    return [
      selectionBlock(context, context.selection),
      ...context.localWindow.blocks,
      ...(context.memoryViewBlocks || []),
      ...context.retrievedEvidence.map((passage) => ({
        id: passage.id,
        text: passage.text,
        source: passage.source,
      })),
      ...context.nearbyAnnotations.map((annotation) => ({
        id: annotation.annotationId,
        text: annotation.text,
        source: annotation.source,
      })),
      ...(context.chapterMemory ? [memoryBlock(context.chapterMemory)] : []),
    ];
  }

  if (context.task === 'selection_thread_reply') {
    return [
      selectionBlock(context, context.originalSelection),
      ...context.localWindow.blocks,
      ...context.thread.messages.map((message) => ({
        id: message.commentId,
        text: message.text,
        source: message.source,
      })),
      ...context.retrievedEvidence.map((passage) => ({
        id: passage.id,
        text: passage.text,
        source: passage.source,
      })),
    ];
  }

  if (context.task === 'chapter_route') {
    return [
      ...(context.readerGoal
        ? [
            {
              id: `${context.book.articleId}:reader-goal`,
              text: context.readerGoal,
              source: sourceLabel(context, { type: 'reader_goal' }),
            },
          ]
        : []),
      ...context.toc.map((chapter) => ({
        id: chapter.chapterId,
        text: [
          `${chapter.indexInBook + 1}. ${chapter.title || '未命名章节'} (${chapter.textLength} 字符${
            chapter.segmentCount === undefined ? '' : `，${chapter.segmentCount} 段`
          })`,
          chapter.previewStart ? `开头预览：${chapter.previewStart}` : '',
          chapter.previewEnd ? `结尾预览：${chapter.previewEnd}` : '',
          chapter.existingSummary ? `已有摘要：${chapter.existingSummary}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        source: chapter.source,
      })),
      ...context.agents.map((agent) => ({
        id: agent.agentId,
        text: agent.roleCard,
        source: agent.source,
      })),
    ];
  }

  return [
    {
      id: context.currentSegment.segmentId,
      text: context.currentSegment.text,
      source: context.currentSegment.source,
    },
    ...context.retrievedEvidence.map((passage) => ({
      id: passage.id,
      text: passage.text,
      source: passage.source,
    })),
    ...(context.memoryViewBlocks || []),
    ...(context.previousMemory ? [segmentMemoryBlock(context.previousMemory)] : []),
    ...(context.previousTrace
      ? [
          {
            id: `${context.previousTrace.segmentId}:trace`,
            text: context.previousTrace.events.join('\n'),
            source: context.previousTrace.source,
          },
        ]
      : []),
    ...(context.nextPreview
      ? [
          {
            id: `${context.currentSegment.segmentId}:next-preview`,
            text: context.nextPreview,
            source: sourceLabel(context, {
              type: 'next_preview',
              segmentId: context.currentSegment.segmentId,
            }),
          },
        ]
      : []),
    ...(context.chapterTrace
      ? [
          {
            id: `${context.chapterTrace.chapterId}:trace`,
            text: context.chapterTrace.events.join('\n'),
            source: context.chapterTrace.source,
          },
        ]
      : []),
    {
      id: `${context.currentSegment.segmentId}:dedup`,
      text: [
        ...context.dedupContext.recentAnchors.map((anchor) => anchor.exact),
        ...(context.dedupContext.recentComments || []),
      ].join('\n'),
      source: context.dedupContext.source,
    },
  ];
}

function packBlockType(
  blocks: SourceLabeledContextBlock[],
  maxTokens: number,
  estimateTokens: TokenEstimator,
) {
  const packedBlocks: PackedContextBlock[] = [];
  const omittedBlocks: OmittedContextBlock[] = [];
  let usedTokens = 0;

  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) {
      omittedBlocks.push({ block, reason: 'empty_text' });
      continue;
    }

    const remaining = maxTokens - usedTokens;
    if (remaining <= 0) {
      omittedBlocks.push({ block, reason: 'budget_exhausted' });
      continue;
    }

    const originalTokenEstimate = estimateTokens(text);
    const packedText = trimTextToTokenBudget(text, remaining, estimateTokens);
    const tokenEstimate = estimateTokens(packedText);
    if (!packedText || tokenEstimate <= 0) {
      omittedBlocks.push({ block, reason: 'budget_exhausted' });
      continue;
    }

    packedBlocks.push({
      ...block,
      text: packedText,
      tokenEstimate,
      originalTokenEstimate,
      truncated: packedText !== text || tokenEstimate < originalTokenEstimate,
    });
    usedTokens += tokenEstimate;
  }

  return { blocks: packedBlocks, omittedBlocks, usedTokens };
}

function availableTokensForType(
  type: ContextSourceType,
  futureTypes: ContextSourceType[],
  remaining: number,
  budget: BudgetPolicy,
) {
  if (remaining <= 0) return 0;
  const reserved = tokenReserve(budget, type);
  if (reserved !== null) return Math.min(remaining, reserved);

  const futureReserved = futureTypes.reduce(
    (total, item) => total + (tokenReserve(budget, item) || 0),
    0,
  );
  return Math.max(0, remaining - Math.min(remaining, futureReserved));
}

function orderBlocks(
  blocks: SourceLabeledContextBlock[],
  blockTypeOrder: ContextSourceType[] = [],
) {
  const typeOrder = [...blockTypeOrder];
  for (const block of blocks) {
    if (!typeOrder.includes(block.source.type)) typeOrder.push(block.source.type);
  }
  return typeOrder.flatMap((type) => blocks.filter((block) => block.source.type === type));
}

function uniqueBlockTypes(blocks: SourceLabeledContextBlock[]) {
  const types: ContextSourceType[] = [];
  for (const block of blocks) {
    if (!types.includes(block.source.type)) types.push(block.source.type);
  }
  return types;
}

function trimTextToTokenBudget(text: string, maxTokens: number, estimateTokens: TokenEstimator) {
  if (maxTokens <= 0) return '';
  if (estimateTokens(text) <= maxTokens) return text;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTokens(text.slice(0, mid)) <= maxTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, low).trimEnd();
}

function selectionBlock(
  context: BaseReadingContext,
  anchor: TextAnchor,
): SourceLabeledContextBlock {
  return {
    id: `${context.book.articleId}:selection:${anchor.start}-${anchor.end}`,
    text: anchor.exact,
    source: sourceLabel(context, {
      type: 'selection',
      chapterId: anchor.chapterId,
      segmentId: anchor.segmentId,
      paragraphId: anchor.paragraphId,
    }),
  };
}

function memoryBlock(memory: { chapterId: string; summary: string; source: ContextSourceLabel }) {
  return {
    id: `${memory.chapterId}:memory`,
    text: memory.summary,
    source: memory.source,
  };
}

function segmentMemoryBlock(memory: {
  segmentId: string;
  summary: string;
  source: ContextSourceLabel;
}) {
  return {
    id: `${memory.segmentId}:memory`,
    text: memory.summary,
    source: memory.source,
  };
}

function sourceLabel(context: BaseReadingContext, source: ContextSourceLabel): ContextSourceLabel {
  return {
    articleId: context.book.articleId,
    ...source,
  };
}

function tokenReserve(budget: BudgetPolicy, type: ContextSourceType) {
  const value = budget.reserveTokensByType?.[type];
  return value === undefined ? null : normalizeTokenBudget(value);
}

function normalizeTokenBudget(value: number) {
  return Math.max(0, Math.floor(value));
}

function defaultTokenEstimator(text: string) {
  return text.length;
}
