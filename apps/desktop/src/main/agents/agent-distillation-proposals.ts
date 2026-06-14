import type {
  Agent,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AnnotationDistillationProposal,
  AnnotationDistillationProposalKind,
  AnnotationDistillationReviewMessage,
  AppSettings,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import { makeId, normalizeUiLanguage } from '@yomitomo/shared';
import type { DesktopMainIpcContext } from '../ipc/ipc';
import { publicCommentAgents } from './agent-runtime-routing';

export async function extractDistillationReviewProposals(input: {
  ai: Pick<typeof import('@yomitomo/ai'), 'callProviderText'>;
  provider: LlmProvider;
  payload: AgentMessagePayload;
  messageContent: string;
  logError: DesktopMainIpcContext['logError'];
}): Promise<AnnotationDistillationProposal[]> {
  if (!input.messageContent.trim()) return [];
  try {
    const raw = await input.ai.callProviderText(input.provider, {
      system: '你把沉淀审阅正文转换成可采纳的稿件修改建议。只返回 JSON，不要解释，不要 Markdown。',
      user: distillationProposalExtractionPrompt(input.payload, input.messageContent),
      maxTokens: 900,
      temperature: 0.2,
    });
    return normalizeDistillationProposalOutput(raw, input.payload.distillationReviewMode);
  } catch (error) {
    input.logError('agent.distillation_proposal_extract_failed', error, {
      articleId: input.payload.article.id,
      annotationId: input.payload.annotation.id,
      mode: input.payload.distillationReviewMode || 'review',
    });
    return [];
  }
}

function distillationProposalExtractionPrompt(
  payload: AgentMessagePayload,
  messageContent: string,
) {
  const mode = payload.distillationReviewMode || 'review';
  const discussion = payload.annotation.comments
    .filter((comment) => comment.content.trim())
    .map((comment) => `- ${comment.author}: ${comment.content}`)
    .join('\n');
  const modeRule =
    mode === 'organize_discussion'
      ? '本轮是整理讨论，只能输出 insert proposals。'
      : '本轮是审阅草稿，可以输出 insert、replace、delete proposals；没有明确目标时不要输出 replace/delete。';
  return `请从下面的审阅正文里提取可采纳的沉淀稿建议。

${modeRule}

返回 JSON 对象：
{
  "proposals": [
    {
      "kind": "insert" | "replace" | "delete",
      "title": "短标题",
      "rationale": "一句话理由，可省略",
      "content": "insert 的新增正文",
      "insertAfterText": "建议插入在哪段之后，可省略",
      "targetText": "replace/delete 的当前草稿目标文本",
      "replacementText": "replace 的替换正文"
    }
  ]
}

规则：
- insert 必须有 content，content 必须是可直接放入沉淀稿的正文，不是评价。
- replace 必须有 targetText 和 replacementText，targetText 必须来自当前草稿。
- delete 必须有 targetText，targetText 必须来自当前草稿。
- 如果只能给泛泛评价，返回 {"proposals":[]}。
- 删除和替换不能无依据改变用户观点。

用户高亮：
${payload.annotation.anchor.exact}

当前沉淀草稿或审阅指令：
${payload.instruction || '空'}

已有想法和讨论：
${discussion || '暂无'}

助手审阅正文：
${messageContent}`;
}

function normalizeDistillationProposalOutput(
  raw: string,
  mode: AgentMessagePayload['distillationReviewMode'],
): AnnotationDistillationProposal[] {
  const parsed = parseJsonObject(raw);
  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  const now = new Date().toISOString();
  return proposals.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const kind = proposalKind(record.kind);
    if (!kind || (mode === 'organize_discussion' && kind !== 'insert')) return [];
    const content = stringField(record.content);
    const targetText = stringField(record.targetText);
    const replacementText = stringField(record.replacementText);
    if (!validProposalFields(kind, content, targetText, replacementText)) return [];
    return [
      {
        id: makeId('distillation_proposal'),
        kind,
        status: 'pending' as const,
        title: stringField(record.title) || proposalTitle(kind, content, targetText, index),
        rationale: stringField(record.rationale) || undefined,
        insertAfterText: stringField(record.insertAfterText) || undefined,
        targetText: targetText || undefined,
        replacementText: kind === 'replace' ? replacementText : undefined,
        content: kind === 'insert' ? content : undefined,
        updatedAt: now,
      },
    ];
  });
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }
}

function proposalKind(value: unknown): AnnotationDistillationProposalKind | null {
  return value === 'insert' || value === 'replace' || value === 'delete' ? value : null;
}

function validProposalFields(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  replacementText: string,
) {
  if (kind === 'insert') return Boolean(content);
  if (kind === 'replace') return Boolean(targetText && replacementText);
  return Boolean(targetText);
}

function proposalTitle(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  index: number,
) {
  const text = kind === 'insert' ? content : targetText;
  const preview = text.length > 18 ? `${text.slice(0, 18)}...` : text;
  if (preview) return `${proposalKindLabel(kind)}：${preview}`;
  return `${proposalKindLabel(kind)}建议 ${index + 1}`;
}

function proposalKindLabel(kind: AnnotationDistillationProposalKind) {
  if (kind === 'insert') return '新增';
  if (kind === 'replace') return '修改';
  return '删除';
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function distillationReviewMessagePayload(
  payload: AgentDistillationReviewPayload,
  agents: Agent[],
  settings: AppSettings,
): AgentMessagePayload {
  return {
    ...payload,
    uiLanguage: normalizeUiLanguage(settings.uiLanguage),
    responseMode: 'distillation_review',
    agentRoster:
      payload.agentRoster || publicCommentAgents(agents, normalizeUiLanguage(settings.uiLanguage)),
  };
}

export function messageWithReviewId(
  message: AnnotationDistillationReviewMessage,
  reviewMessageId: string | undefined,
) {
  return reviewMessageId ? { ...message, id: reviewMessageId } : message;
}

export function commentToDistillationReviewMessage(
  comment: Comment,
  reviewMessageId: string | undefined,
): AnnotationDistillationReviewMessage {
  return {
    id: reviewMessageId || comment.id || makeId('distillation_review_message'),
    author: 'ai',
    content: comment.content,
    createdAt: comment.createdAt,
    agentId: comment.agentId,
    agentUsername: comment.agentUsername,
    agentNickname: comment.agentNickname,
    agentAvatar: comment.agentAvatar,
  };
}
