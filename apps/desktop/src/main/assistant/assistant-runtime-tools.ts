import type {
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolEvidenceInput,
  AssistantToolExecutionResult,
} from '@yomitomo/ai';
import {
  createAssistantReadingContextProvider,
  recordField,
  stringField,
  type AssistantReadingContextProviderInput,
} from './assistant-reading-context-provider';

export type AssistantReadingToolExecutorInput = AssistantReadingContextProviderInput;

export const assistantReadingToolDefinitions: AssistantToolDefinition[] = [
  {
    name: 'get_current_thread',
    description:
      '读取当前批注 thread 的锚点、原始想法和评论。需要理解当前讨论对象、确认读者在回应谁、区分原始想法和最新评论时使用。',
  },
  {
    name: 'get_anchor_context',
    description:
      '读取当前 anchor 附近原文。需要核对高亮句子的上下文、解释原文含义、判断想法是否有文本依据时使用。',
  },
  {
    name: 'search_article_passages',
    description:
      '在当前文章原文内按关键词检索 passage。需要查找同一概念在其他段落的展开、补充远处原文证据或验证跨段落判断时使用。',
    validateInput: requireQuery,
  },
  {
    name: 'search_article_memory',
    description:
      '检索当前文章内公开可见的阅读记忆。需要查看已有批注、讨论或共识，判断当前问题是否已有相关沉淀时使用。',
    validateInput: requireQuery,
  },
  {
    name: 'search_own_memory',
    description:
      '只检索当前助手自己在当前文章留下的阅读记忆。读者询问“你之前怎么看”、需要保持自己观点连续性或避免自相矛盾时使用。',
    validateInput: requireQuery,
  },
  {
    name: 'search_other_agents_memory',
    description:
      '检索其他助手在当前文章留下的公开阅读记忆。需要回应、比较或引用其他助手观点，或读者提到其他助手时使用。',
    validateInput: requireQuery,
  },
  {
    name: 'check_duplicate_thought',
    description:
      '检查候选想法是否和当前 anchor 附近记忆重复。准备新增顶层想法、沉淀判断或提出新的 thread 观点前使用。',
    validateInput: requireCandidateThought,
  },
];

export function createAssistantReadingToolExecutor(input: AssistantReadingToolExecutorInput) {
  const contextProvider = createAssistantReadingContextProvider(input);
  return async (toolCall: AssistantToolCall): Promise<AssistantToolExecutionResult> => {
    try {
      switch (toolCall.name) {
        case 'get_current_thread':
          return okEvidence(contextProvider.currentThread(toolCall.input));
        case 'get_anchor_context':
          return okEvidence(contextProvider.anchorContext(toolCall.input));
        case 'search_article_passages':
          return okEvidence(contextProvider.searchArticlePassages(toolCall.input));
        case 'search_article_memory':
          return okEvidence(contextProvider.searchArticleMemory(toolCall.input));
        case 'search_own_memory':
          return okEvidence(contextProvider.searchOwnMemory(toolCall.input));
        case 'search_other_agents_memory':
          return okEvidence(contextProvider.searchOtherAgentsMemory(toolCall.input));
        case 'check_duplicate_thought':
          return okEvidence(contextProvider.checkDuplicateThought(toolCall.input));
      }
      return { ok: false, failureReason: 'unknown_tool' };
    } catch (error) {
      return {
        ok: false,
        failureReason: error instanceof Error ? error.message : 'tool_execution_failed',
      };
    }
  };
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
