import type { Agent, AgentReviewPayload, Comment, LlmProvider } from '@yomitomo/shared';
import {
  normalizeReviewOpinionLabel,
  reviewOpinionLabels,
  type ReviewOpinionLabel,
} from '@yomitomo/shared';
import {
  buildCurrentChapterLexicalRelatedPassages,
  buildReadingContextBundle,
  selectionThreadSpoilerPolicy,
  wholeBookSpoilerPolicy,
  type ReadingContextBundle,
} from '@yomitomo/core';
import { budgetArticleText, formatBudgetNotice } from '../provider/budget';
import { logAiInfo } from '../logger';
import { buildAgentRoleCard } from './agent-role-card';
import { parseJsonArray, stringValue } from '../json';
import { callProviderText } from '../provider/provider-client';
import { spoilerScopePrompt } from './agent-runtime-prompts';

type ReviewThought = {
  author: string;
  content: string;
  id: string;
};

type ReviewOpinion = {
  content: string;
  label: ReviewOpinionLabel;
  thoughtId: string;
};

export async function runAgentReview(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentReviewPayload,
): Promise<Comment[]> {
  const context = buildAgentReviewContextBundle(payload);
  const content = await callProviderText(provider, {
    system: buildAgentReviewSystemPrompt(agent),
    user: buildAgentReviewPrompt(provider, payload, agent, context),
    maxTokens: 2400,
    temperature: agent.temperature,
  });
  const opinions = parseReviewOpinions(content, reviewableThoughtIds(payload, agent));
  const now = new Date().toISOString();

  return opinions.map((opinion) => ({
    id: '',
    author: 'ai',
    content: opinion.content,
    createdAt: now,
    replyTo: opinion.thoughtId,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    reviewLabel: opinion.label,
  }));
}

function buildAgentReviewSystemPrompt(agent: Agent) {
  return `${buildAgentRoleCard(agent)}\n\n你正在作为阅读器里的审阅助手 ${agent.nickname}（@${agent.username}）审阅一条划线批注里的所有想法。你的输出会被写入对应想法 thread 下的评论。你不是重新写批注，也不是回答用户闲聊；你只判断每条想法的质量、证据强度、遗漏和可继续推进处。\n\n审阅评论必须由一个标签和一段观点内容组成。标签只能使用：${reviewOpinionLabels.join('、')}。\n\n标签使用规则：\n- 站得住：认可类，偏事实验证维度，表示这条想法有足够文本或讨论依据。\n- 有洞察：认可类，偏思考质量维度，表示这条想法提出了不显而易见的观点。\n- 有异议：质疑类，表示你有明确的反对理由。\n- 待验证：质疑类，表示不一定错，但依据不足，需要补充验证。\n- 可深挖：补充类，表示方向对但止步太早，还能往下推。\n- 有遗漏：补充类，表示忽略了某个重要维度。\n\n每条想法最多给 1 条审阅评论；没有有价值观点时跳过。保持具体、克制，观点必须回到原文、批注想法或讨论上下文。`;
}

function buildAgentReviewContextBundle(payload: AgentReviewPayload) {
  const spoilerPolicy =
    payload.spoilerPolicy ||
    (payload.article.ebookIndex ? selectionThreadSpoilerPolicy : wholeBookSpoilerPolicy);
  return buildReadingContextBundle({
    articleText: payload.article.text,
    ebookIndex: payload.article.ebookIndex,
    targetAnchor: payload.annotation.anchor,
    readerProgress: payload.readerProgress,
    spoilerPolicy,
    relatedPassages: agentReviewRelatedPassages(payload, spoilerPolicy),
  });
}

function agentReviewRelatedPassages(
  payload: AgentReviewPayload,
  spoilerPolicy: ReadingContextBundle['spoilerPolicy'],
) {
  const index = payload.article.ebookIndex;
  if (!index) return [];
  return buildCurrentChapterLexicalRelatedPassages({
    articleText: payload.article.text,
    ebookIndex: index,
    query: [
      payload.annotation.anchor.exact,
      reviewThoughts(payload)
        .map((item) => item.content)
        .join('\n'),
    ],
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

function buildAgentReviewPrompt(
  provider: LlmProvider,
  payload: AgentReviewPayload,
  agent: Agent,
  context: ReadingContextBundle,
) {
  const article = budgetArticleText(provider, 'agent-message', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);
  const thoughts = reviewThoughts(payload);
  const unavailableThoughtIds = reviewedThoughtIds(payload, agent);
  const unavailablePrompt =
    unavailableThoughtIds.length > 0
      ? `\n\n你已经审阅过这些想法，本轮不要再次输出：${unavailableThoughtIds.join('、')}`
      : '';

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${spoilerScopePrompt(context)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n待审阅想法：\n${JSON.stringify(thoughts, null, 2)}${unavailablePrompt}\n\n请返回 JSON 数组。每个元素包含：\n- thoughtId：必须等于待审阅想法里的 id\n- label：只能是 ${reviewOpinionLabels.join('、')} 之一\n- content：你的审阅观点，1-3 句，必须具体说明依据或缺口\n\n输出要求：\n- 每个 thoughtId 最多出现一次。\n- 没有必要评论的想法可以跳过。\n- 不要输出 Markdown，不要输出数组之外的解释文字。`;
}

function reviewThoughts(payload: AgentReviewPayload): ReviewThought[] {
  const roots = payload.annotation.comments.filter((comment) => !comment.replyTo);
  return roots.map((comment) => ({
    id: comment.id,
    author:
      comment.author === 'ai'
        ? comment.agentNickname || comment.agentUsername || 'AI'
        : comment.userNickname || '读者',
    content: comment.content,
  }));
}

function reviewableThoughtIds(payload: AgentReviewPayload, agent: Agent) {
  const blocked = new Set(reviewedThoughtIds(payload, agent));
  return new Set(
    reviewThoughts(payload).flatMap((thought) => (blocked.has(thought.id) ? [] : [thought.id])),
  );
}

function reviewedThoughtIds(payload: AgentReviewPayload, agent: Agent) {
  return payload.annotation.comments.flatMap((comment) =>
    comment.replyTo && comment.reviewLabel && comment.agentId === agent.id ? [comment.replyTo] : [],
  );
}

function parseReviewOpinions(content: string, allowedThoughtIds: Set<string>): ReviewOpinion[] {
  const seenThoughtIds = new Set<string>();
  const parsed = parseJsonArray(content);
  const opinions: ReviewOpinion[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const thoughtId = stringValue(record.thoughtId);
    const label = normalizeReviewOpinionLabel(record.label);
    const opinionContent = stringValue(record.content);
    if (!thoughtId || !label || !opinionContent) continue;
    if (!allowedThoughtIds.has(thoughtId) || seenThoughtIds.has(thoughtId)) continue;
    seenThoughtIds.add(thoughtId);
    opinions.push({ thoughtId, label, content: opinionContent });
  }

  return opinions;
}
