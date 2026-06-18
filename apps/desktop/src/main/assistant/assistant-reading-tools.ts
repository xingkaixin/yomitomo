import type {
  AgentMessageReadingContextSnapshot,
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolEvidenceInput,
  AssistantToolExecutionResult,
} from '@yomitomo/ai';
import type { AgentMessagePayload, ArticleRecord } from '@yomitomo/shared';
import {
  createAssistantReadingContextProvider,
  type AssistantReadingContextProvider,
  type AssistantReadingContextProviderInput,
} from './assistant-reading-context-provider';
import type { ReadingMemorySqliteExecutor } from '../reading-memory/reading-memory-store';

export type AssistantReadingToolsInput = AssistantReadingContextProviderInput;

type AssistantReadingToolSpec = AssistantToolDefinition & {
  execute: (
    provider: AssistantReadingContextProvider,
    input: unknown,
  ) => AssistantToolEvidenceInput[];
};

export type AssistantReadingTools = {
  tools: AssistantToolDefinition[];
  toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
};

const assistantReadingToolSpecs: AssistantReadingToolSpec[] = [
  {
    name: 'get_current_thread',
    description:
      '读取当前批注 thread 的锚点、原始想法和评论。需要理解当前讨论对象、确认读者在回应谁、区分原始想法和最新评论时使用。',
    execute: (provider, input) => provider.currentThread(input),
  },
  {
    name: 'get_anchor_context',
    description:
      '读取当前 anchor 附近原文。需要核对高亮句子的上下文、解释原文含义、判断想法是否有文本依据时使用。',
    execute: (provider, input) => provider.anchorContext(input),
  },
  {
    name: 'search_article_passages',
    description:
      '在当前文章原文内按关键词检索 passage。需要查找同一概念在其他段落的展开、补充远处原文证据或验证跨段落判断时使用。',
    validateInput: requireQuery,
    execute: (provider, input) => provider.searchArticlePassages(input),
  },
  {
    name: 'search_article_memory',
    description:
      '检索当前文章内公开可见的阅读记忆。需要查看已有批注、讨论或共识，判断当前问题是否已有相关沉淀时使用。',
    validateInput: requireQuery,
    execute: (provider, input) => provider.searchArticleMemory(input),
  },
  {
    name: 'search_own_memory',
    description:
      '只检索当前助手自己在当前文章留下的阅读记忆。读者询问“你之前怎么看”、需要保持自己观点连续性或避免自相矛盾时使用。',
    validateInput: requireQuery,
    execute: (provider, input) => provider.searchOwnMemory(input),
  },
  {
    name: 'search_other_agents_memory',
    description:
      '检索其他助手在当前文章留下的公开阅读记忆。需要回应、比较或引用其他助手观点，或读者提到其他助手时使用。',
    validateInput: requireQuery,
    execute: (provider, input) => provider.searchOtherAgentsMemory(input),
  },
  {
    name: 'check_duplicate_thought',
    description:
      '检查候选想法是否和当前 anchor 附近记忆重复。准备新增顶层想法、沉淀判断或提出新的 thread 观点前使用。',
    validateInput: requireCandidateThought,
    execute: (provider, input) => provider.checkDuplicateThought(input),
  },
];

const assistantReadingToolDefinitions: AssistantToolDefinition[] = assistantReadingToolSpecs.map(
  ({ name, description, validateInput }) => ({
    name,
    description,
    validateInput,
  }),
);

export function createAssistantReadingTools(
  input: AssistantReadingToolsInput,
): AssistantReadingTools {
  return {
    tools: assistantReadingToolDefinitions,
    toolExecutor: createAssistantReadingToolExecutor(input),
  };
}

function createAssistantReadingToolExecutor(input: AssistantReadingToolsInput) {
  const contextProvider = createAssistantReadingContextProvider(input);
  return async (toolCall: AssistantToolCall): Promise<AssistantToolExecutionResult> => {
    const spec = assistantReadingToolSpecs.find((item) => item.name === toolCall.name);
    if (!spec) return { ok: false, failureReason: 'unknown_tool' };
    try {
      return okEvidence(spec.execute(contextProvider, toolCall.input));
    } catch (error) {
      return {
        ok: false,
        failureReason: error instanceof Error ? error.message : 'tool_execution_failed',
      };
    }
  };
}

export function createAgentMessageReadingContextSnapshot(input: {
  payload: AgentMessagePayload;
  agentId: string;
  executor?: ReadingMemorySqliteExecutor;
}): AgentMessageReadingContextSnapshot | undefined {
  const articleId = input.payload.article.id;
  if (!articleId) return undefined;

  const queries = snapshotSearchQueries([
    input.payload.annotation.anchor.exact,
    input.payload.userComment.content,
    input.payload.instruction,
  ]);
  if (queries.length === 0) return undefined;

  const provider = createAssistantReadingContextProvider({
    article: {
      id: articleId,
      title: input.payload.article.title,
      annotations: [input.payload.annotation],
      ebook: input.payload.article.ebookIndex
        ? ({ index: input.payload.article.ebookIndex } as ArticleRecord['ebook'])
        : undefined,
    },
    articleText: input.payload.article.text,
    agentId: input.agentId,
    currentAnnotationId: input.payload.annotation.id,
    currentThreadRootCommentId:
      input.payload.reviewTargetCommentId || input.payload.userComment.replyTo,
    currentAnchor: input.payload.annotation.anchor,
    readerProgress: input.payload.readerProgress,
    executor: input.executor,
  });
  const memoryEvidence = uniqueEvidence(
    queries.flatMap((query) => provider.searchArticleMemory({ query })),
  );
  return memoryEvidence.length > 0 ? { memoryEvidence } : undefined;
}

function okEvidence(evidence: AssistantToolEvidenceInput[]): AssistantToolExecutionResult {
  return { ok: true, evidence };
}

function requireQuery(input: unknown) {
  return stringField(recordField(input, 'query')) ? null : 'missing_query';
}

function requireCandidateThought(input: unknown) {
  return stringField(recordField(input, 'candidateThought')) ? null : 'missing_candidate_thought';
}

function uniqueEvidence(evidence: AssistantToolEvidenceInput[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = [
      item.provenance.sourceAnnotationId,
      item.provenance.sourceCommentId,
      item.provenance.sourceType,
      item.summary,
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function snapshotSearchQueries(values: Array<string | undefined>) {
  const queries = values.flatMap((value) => {
    const text = value?.trim();
    if (!text) return [];
    return [text, ...cjkSearchWindows(text)];
  });
  return Array.from(new Set(queries)).slice(0, 12);
}

function cjkSearchWindows(text: string) {
  const normalized = text.replace(/[^\p{L}\p{N}_]+/gu, '');
  if (!/[\p{Script=Han}]/u.test(normalized) || normalized.length <= 4) return [];
  const windows: string[] = [];
  for (let index = 0; index <= normalized.length - 4 && windows.length < 6; index += 1) {
    windows.push(normalized.slice(index, index + 4));
  }
  return windows;
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
