import type { AgentMessagePayload, Annotation, Comment, LlmProvider } from '@yomitomo/shared';
import {
  buildCurrentChapterLexicalRelatedPassages,
  buildReadingContextBundle,
  selectionThreadSpoilerPolicy,
  wholeBookSpoilerPolicy,
  type ReadingContextBundle,
} from '@yomitomo/core';
import { resolvePromptAgentIdentity } from '@yomitomo/shared';
import { budgetArticleText, formatBudgetNotice } from '../provider/budget';
import { logAiInfo } from '../logger';
import { callProviderText, streamProviderText } from '../provider/provider-client';
import { buildAgentRoleCard, type PromptAgent } from './agent-role-card';
import {
  buildSelectionThreadContext,
  selectionThreadContextPrompt,
} from '../context/selection-context';
import {
  readingAssistantPrinciplesPrompt,
  readingIntentPromptLine,
  readingIntentSystemPrompt,
  reviewAssistantPrinciplesPrompt,
  spoilerScopePrompt,
} from './agent-runtime-prompts';
import { memoryViewContextBlocks } from '../context/reading-view-assembler';
import { responseLanguageSystemPrompt } from './agent-language';

export async function runAgentStream(
  provider: LlmProvider,
  agent: PromptAgent & { temperature: number },
  payload: AgentMessagePayload,
  onDelta: (delta: string) => void,
): Promise<void> {
  const system = buildAgentMessageSystemPrompt(agent, payload);
  const user = buildAgentPrompt(provider, payload, agent);
  await streamProviderText(
    provider,
    { system, user, maxTokens: agentMessageMaxTokens(payload), temperature: agent.temperature },
    onDelta,
  );
}

export async function runAgent(
  provider: LlmProvider,
  agent: {
    id: string;
    presetId?: string;
    username: string;
    nickname: string;
    avatar: string;
    annotationColor: string;
    temperature: number;
    soul: string;
  },
  payload: AgentMessagePayload,
): Promise<Comment> {
  const system = buildAgentMessageSystemPrompt(agent, payload);
  const user = buildAgentPrompt(provider, payload, agent);
  const content = await callProviderText(provider, {
    system,
    user,
    maxTokens: agentMessageMaxTokens(payload),
    temperature: agent.temperature,
  });

  return {
    id: '',
    author: 'ai',
    content,
    createdAt: new Date().toISOString(),
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    readingIntent: payload.readingIntent,
  };
}

export function buildAgentThreadReplyRuntimePayload(
  provider: LlmProvider,
  agent: PromptAgent & { temperature: number },
  payload: AgentMessagePayload,
) {
  const runtimePayload = {
    ...payload,
    readingMemoryView: undefined,
  };
  return {
    system: `${buildAgentMessageSystemPrompt(agent, runtimePayload)}\n\n你现在通过 assistant tool runtime 回复批注 thread。工具调用由 API tools 协议完成；如果需要上下文，调用可用工具。完成工具探索后，最终直接输出将写入 thread 的回复正文，不要输出 JSON。`,
    user: `${buildAgentPrompt(provider, runtimePayload, agent)}\n\nthread 回复要求：\n- 先理解当前批注 thread 的原始想法：谁写的、想法内容是什么、它和原文锚点是什么关系。\n- 如果读者只是 @ 你，默认是在邀请你评论或接续这条原始想法，而不是只和读者单独聊天。\n- 回复应当自然带入原始想法作者的观点：可以补充、回应、赞同、追问或挑战，但不要让原始想法作者在语义上消失。\n- 如果原始想法来自其他助手，必要时用对方昵称或 @ 指代其观点。\n- 没有工具证据时不要编造历史断言。\n\n最终输出要求：直接输出回复正文，不要输出 JSON、字段名、证据列表或解释性包装。`,
    maxTokens: 1200,
    temperature: agent.temperature,
  };
}

export function buildAgentCreateThoughtRuntimePayload(
  provider: LlmProvider,
  agent: PromptAgent & { temperature: number },
  payload: AgentMessagePayload,
) {
  const runtimePayload = {
    ...payload,
    responseMode: 'create_thought' as const,
    readingMemoryView: undefined,
  };
  return {
    system: `${buildAgentMessageSystemPrompt(agent, runtimePayload)}\n\n你现在通过 assistant tool runtime 为当前批注添加顶层助手想法。工具调用由 API tools 协议完成；如果需要上下文，调用可用工具。完成工具探索后，最终直接输出将写入当前批注的顶层助手想法，不要输出 JSON。`,
    user: `${buildAgentPrompt(provider, runtimePayload, agent)}\n\n新增想法要求：\n- 先理解当前高亮、已有想法和讨论，避免重复已有观点。\n- 可以查证原文上下文、当前 thread 和阅读记忆。\n- 你的输出会作为当前批注下的新顶层想法，不是回复某一条评论。\n- 没有工具证据时不要编造历史断言。\n\n最终输出要求：直接输出顶层助手想法正文，不要输出 JSON、字段名、证据列表或解释性包装。`,
    maxTokens: 1200,
    temperature: agent.temperature,
  };
}

export function buildAgentDistillationReviewRuntimePayload(
  provider: LlmProvider,
  agent: PromptAgent & { temperature: number },
  payload: AgentMessagePayload,
) {
  const runtimePayload = {
    ...payload,
    responseMode: 'distillation_review' as const,
    readingMemoryView: undefined,
  };
  const proposalRequirement =
    payload.distillationReviewMode === 'organize_discussion'
      ? 'proposals 只能包含 insert，用 content 放可直接追加到沉淀稿的新增文本；不要生成 replace 或 delete。'
      : 'proposals 可以为空，也可以包含 insert、replace、delete；replace/delete 必须带当前草稿中明确存在的 targetText。';
  return {
    system: `${buildAgentMessageSystemPrompt(agent, runtimePayload)}\n\n你现在通过 assistant tool runtime 审阅当前批注的沉淀稿。工具调用由 API tools 协议完成；如果需要上下文，调用可用工具。完成工具探索后，用 review_distillation final action 返回审阅正文和可采纳的稿件建议。`,
    user: `${buildAgentPrompt(provider, runtimePayload, agent)}\n\n沉淀审阅要求：\n- 先核对当前高亮、已有想法和讨论，再判断沉淀稿是否站得住。\n- 可以查证原文上下文、当前 thread 和阅读记忆。\n- 只输出审阅意见、质疑、补充或可带走的判断框架，不直接发布或覆盖沉淀稿。\n- 没有工具证据时不要编造历史断言。\n\n最终输出要求：返回 review_distillation final action。content 是自然语言审阅正文；proposals 是 0 到多条可采纳稿件建议，只允许 insert、replace、delete。insert 必须带 content；replace 必须带 targetText 和 replacementText；delete 必须带 targetText。没有可靠建议时返回空 proposals。删除和替换必须能在当前草稿中找到明确目标，不要无依据删除用户观点。${proposalRequirement}`,
    maxTokens: 1200,
    temperature: agent.temperature,
  };
}

type PromptAgentIdentity = {
  username?: string;
  nickname?: string;
};

export function buildAgentMessageSystemPrompt(agent: PromptAgent, payload: AgentMessagePayload) {
  const identity = resolvePromptAgentIdentity(agent, payload.uiLanguage);
  const username = identity.username || payload.agentUsername;
  const nickname = identity.nickname || username;
  const selfNames = [nickname, `@${username}`]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join('、');

  if (payload.responseMode === 'create_thought') {
    return `${buildAgentRoleCard(agent, payload.uiLanguage)}

你正在为网页阅读器的一条批注添加一条助手想法。你的输出会作为“想法”直接展示在批注旁边，而不是 thread 回复。${readingAssistantPrinciplesPrompt(payload.uiLanguage)}${readingIntentSystemPrompt(payload)}

输出边界：
- 只输出一个单纯、可带走的观点或判断框架，围绕原文和用户高亮。
- 角色卡用于影响你的判断视角、问题敏感度和取舍标准；不要把角色卡写成自我介绍或身份表演。
- 不要自我介绍，不要寒暄。
- 不要 @ 用户或其他助手，不要写成对话回复。
- 不展示思考过程、推导草稿、行动计划或长篇铺垫。
- 默认 1 到 3 个短段落；能用一句话说清就不要展开成文章。${responseLanguageSystemPrompt(payload.uiLanguage)}`;
  }

  if (payload.responseMode === 'distillation_review') {
    return `${buildAgentRoleCard(agent, payload.uiLanguage)}

你正在作为网页阅读器里的审阅助手 ${nickname}（@${username}）审阅用户准备沉淀的一段阅读笔记。${readingAssistantPrinciplesPrompt(payload.uiLanguage)}${reviewAssistantPrinciplesPrompt(payload.uiLanguage)}${readingIntentSystemPrompt(payload)}

审阅边界：
- 角色卡用于影响你的判断视角、问题敏感度和取舍标准；不要把角色卡写成自我介绍或身份表演。
- 你不是替用户改写沉淀，也不是直接发布结论。
- 只给反馈、质疑、补充或可带走的判断框架。
- 不要 @ 用户，不要寒暄，不要展示思考过程。
- 默认 1 到 3 个短段落；能用一句话说清就不要展开成文章。${responseLanguageSystemPrompt(payload.uiLanguage)}`;
  }

  if (payload.reviewTargetCommentId) {
    return `${buildAgentRoleCard(agent, payload.uiLanguage)}\n\n你正在作为网页阅读器里的审阅助手 ${nickname}（@${username}）复核一条批注想法。你的回复会成为该想法 thread 中的一条评论。保持具体、克制、围绕原文和已有讨论，不要改写读者想法。${readingAssistantPrinciplesPrompt(payload.uiLanguage)}${readingIntentSystemPrompt(payload)}\n\n身份识别：你就是 ${nickname}（@${username}）。当前讨论里出现 ${selfNames} 时，按你本人理解。审阅时要先判断目标想法有没有原文依据、推理缺口、表达风险或可保留价值，再给出可执行的观点。\n\n角色表达：把角色卡中的自我介绍、核心气质、判断习惯和输出偏好落实到回复里；从你的专业能力切入，给出有辨识度的审阅判断。${responseLanguageSystemPrompt(payload.uiLanguage)}`;
  }

  return `${buildAgentRoleCard(agent, payload.uiLanguage)}\n\n你正在作为网页阅读器里的 ${nickname}（@${username}）参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。${readingAssistantPrinciplesPrompt(payload.uiLanguage)}${readingIntentSystemPrompt(payload)}\n\n身份识别：你就是 ${nickname}（@${username}）。当前讨论里出现 ${selfNames} 时，按你本人理解。结合上下文判断读者是在询问你的批注、你的判断，还是在询问其他助手的观点。涉及自己的判断时，用自然的第一人称承接；涉及其他助手时，使用对方昵称或 @。\n\nthread 参与边界：你不是只回复最新评论者，而是在加入这条批注想法的讨论。必须先考虑原始想法的作者和内容，再回应最新读者评论；读者只 @ 你时，也视为邀请你评论这条原始想法。\n\n取证边界：只有当前 thread 或 memory_view 明确提供了对应内容时，才能声称“我之前批注过”“我之前说过”或“其他助手批注过”。没有证据时，直接说明当前上下文里没有看到这类历史记录。\n\n角色表达：把角色卡中的自我介绍、核心气质、判断习惯和输出偏好落实到回复里；从你的专业能力切入，给出有辨识度的判断。${responseLanguageSystemPrompt(payload.uiLanguage)}`;
}

function buildAgentMessageContextBundle(payload: AgentMessagePayload) {
  const spoilerPolicy =
    payload.spoilerPolicy ||
    (payload.article.ebookIndex ? selectionThreadSpoilerPolicy : wholeBookSpoilerPolicy);
  return buildReadingContextBundle({
    articleText: payload.article.text,
    ebookIndex: payload.article.ebookIndex,
    targetAnchor: payload.annotation.anchor,
    readerProgress: payload.readerProgress,
    spoilerPolicy,
    relatedPassages: agentMessageRelatedPassages(payload, spoilerPolicy),
  });
}

function agentMessageRelatedPassages(
  payload: AgentMessagePayload,
  spoilerPolicy: ReadingContextBundle['spoilerPolicy'],
) {
  const index = payload.article.ebookIndex;
  if (!index) return [];
  return buildCurrentChapterLexicalRelatedPassages({
    articleText: payload.article.text,
    ebookIndex: index,
    query: [payload.annotation.anchor.exact, payload.userComment.content],
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

export function buildAgentPrompt(
  provider: LlmProvider,
  payload: AgentMessagePayload,
  agent?: PromptAgentIdentity,
) {
  const context = buildAgentMessageContextBundle(payload);
  const comments = focusedThreadComments(payload)
    .map((comment) => {
      return `${comment.replyTo ? `回复 ${comment.replyTo} ` : ''}${formatCommentAuthor(comment)}: ${comment.content}`;
    })
    .join('\n');
  const userMention = formatUserMention(payload.userComment);
  const participants = buildAgentMessageParticipants(payload, agent);
  const selfInstruction = buildAgentSelfInstruction(payload, agent);
  const readerInstruction = payload.instruction
    ? `\n\n读者对你的具体要求：${payload.instruction}`
    : '';
  const threadContextPrompt = selectionThreadPromptBlock(payload, context);
  const memoryViewPrompt = payload.article.ebookIndex ? '' : threadMemoryViewPromptBlock(payload);

  if (payload.responseMode === 'create_thought') {
    return buildAgentCreateThoughtPrompt(provider, payload, context, threadContextPrompt);
  }

  if (payload.responseMode === 'distillation_review') {
    return buildAgentDistillationReviewPrompt(provider, payload, context, threadContextPrompt);
  }

  if (payload.reviewTargetCommentId) {
    return buildAgentThoughtReviewPrompt(
      provider,
      payload,
      context,
      participants,
      selfInstruction,
      threadContextPrompt,
    );
  }

  if (threadContextPrompt) {
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${threadContextPrompt}${readingIntentPromptLine(payload)}${readerInstruction}${spoilerScopePrompt(context)}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n可提及的读者账号：${userMention}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。回复必须回到 thread-first 上下文中的原文依据，并且要回应当前 thread 的原始想法，而不只是回应最新读者评论。`;
  }

  const article = budgetArticleText(provider, 'agent-message', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${memoryViewPrompt}${readingIntentPromptLine(payload)}${readerInstruction}${spoilerScopePrompt(context)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n可提及的读者账号：${userMention}\n\n当前批注讨论：\n${comments}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。回复必须回应当前 thread 的原始想法，而不只是回应最新读者评论。`;
}

function buildAgentDistillationReviewPrompt(
  provider: LlmProvider,
  payload: AgentMessagePayload,
  context: ReadingContextBundle,
  threadContextPrompt: string,
) {
  const draft = payload.instruction?.trim() || '用户还没有写沉淀草稿。';
  const discussion = formatCreateThoughtContext(payload.annotation);
  const modeRequirement =
    payload.distillationReviewMode === 'organize_discussion'
      ? '本轮任务是整理讨论：只提出可新增到沉淀稿的方向，不要建议修改或删除现有草稿。'
      : '本轮任务是审阅草稿：可以指出新增、修改或删除方向，但不要直接替用户改稿。';
  const task = `${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}

用户高亮：
${payload.annotation.anchor.exact}

用户当前沉淀草稿：
${draft}

已有想法和讨论：
${discussion}

请审阅这段沉淀。要求：
- ${modeRequirement}
- 输出应该帮助用户判断这段沉淀是否值得发布、是否缺证据、是否可以更准确。
- 如果草稿为空，基于高亮、想法和讨论给出可沉淀方向、风险或反问。
- 不要替用户完整改写，不要给发布决定，不要输出 Markdown 标题或 JSON。`;

  if (threadContextPrompt) {
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${threadContextPrompt}\n\n${task}`;
  }

  const article = budgetArticleText(provider, 'agent-message', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);
  const memoryViewPrompt = payload.article.ebookIndex ? '' : threadMemoryViewPromptBlock(payload);

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}

${budgetNotice}

可用原文范围：
${article.text}${memoryViewPrompt}

${task}`;
}

function buildAgentCreateThoughtPrompt(
  provider: LlmProvider,
  payload: AgentMessagePayload,
  context: ReadingContextBundle,
  threadContextPrompt: string,
) {
  const readerInstruction = payload.instruction ? `\n\n读者给你的指令：${payload.instruction}` : '';
  const existingThoughts = formatCreateThoughtContext(payload.annotation);
  const task = `${readingIntentPromptLine(payload)}${readerInstruction}${spoilerScopePrompt(context)}

用户高亮：
${payload.annotation.anchor.exact}

已有想法和讨论（仅用于避免重复，不要逐条回应）：
${existingThoughts}

请输出一条新的批注想法。要求：
- 直接给最终观点，不展示思考过程。
- 不要 @ 任何人，不要称呼读者，不要写成回复。
- 观点应该像一个读者可以带走的判断、分析工具或提醒，而不是必须全盘接受的结论。
- 保持简短，避免长篇文章、Markdown 标题和 JSON。`;

  if (threadContextPrompt) {
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${threadContextPrompt}\n\n${task}`;
  }

  const article = budgetArticleText(provider, 'agent-message', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);
  const memoryViewPrompt = payload.article.ebookIndex ? '' : threadMemoryViewPromptBlock(payload);

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}

${budgetNotice}

可用原文范围：
${article.text}${memoryViewPrompt}

${task}`;
}

function buildAgentThoughtReviewPrompt(
  provider: LlmProvider,
  payload: AgentMessagePayload,
  context: ReadingContextBundle,
  participants: string,
  selfInstruction: string,
  threadContextPrompt: string,
) {
  const targetComment =
    payload.annotation.comments.find((comment) => comment.id === payload.reviewTargetCommentId) ||
    payload.userComment;
  const allThoughts = formatThoughtReviewThreads(payload.annotation);
  const reviewTask = `批注中的全部想法：\n${allThoughts}\n\n审阅目标想法：\n${formatCommentAuthor(targetComment)}: ${targetComment.content}\n\n请直接输出一条将作为该想法回复的审阅评论。要求：\n- 第一句话以【审阅】开头，然后给出你的判断\n- 只审阅目标想法，但要参考全部想法识别重复、冲突、证据缺口或可保留部分\n- 必须回到原文或 thread-first 上下文；证据不足时直接指出不足\n- 不要寒暄，不要复述任务，不要输出 JSON 或 Markdown 标题`;

  if (threadContextPrompt) {
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${threadContextPrompt}${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n${reviewTask}`;
  }

  const article = budgetArticleText(provider, 'agent-message', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);

  const memoryViewPrompt = payload.article.ebookIndex ? '' : threadMemoryViewPromptBlock(payload);
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${memoryViewPrompt}${readingIntentPromptLine(payload)}${spoilerScopePrompt(context)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n${reviewTask}`;
}

function selectionThreadPromptBlock(payload: AgentMessagePayload, context: ReadingContextBundle) {
  const threadContext = buildSelectionThreadContext(payload, context);
  return threadContext ? selectionThreadContextPrompt(threadContext) : '';
}

function threadMemoryViewPromptBlock(payload: AgentMessagePayload) {
  const blocks = memoryViewContextBlocks(payload.readingMemoryView);
  if (blocks.length === 0) return '';
  return `\n\nthread memory_view：\n${JSON.stringify(
    blocks.map((block) => ({
      id: block.id,
      source: block.source,
      text: block.text,
    })),
    null,
    2,
  )}\n\nmemory_view 使用规则：\n- memory_view 是同篇文章内已有批注、讨论和共读记忆，只能作为相关背景，不能覆盖当前 thread。\n- 当前批注讨论和刚刚触发你的读者评论优先级更高。\n- 只有 memory_view 或当前 thread 明确提供证据时，才能声称自己或其他助手曾经批注、评论或表达过某个观点。\n- 如果 memory_view 与当前 thread 无关，忽略它。`;
}

function focusedThreadComments(payload: AgentMessagePayload) {
  const rootId = payload.reviewTargetCommentId || payload.userComment.replyTo;
  if (!rootId) return payload.annotation.comments.filter((comment) => comment.content.trim());
  const root = payload.annotation.comments.find((comment) => comment.id === rootId);
  const resolvedRootId = root?.replyTo || root?.id || rootId;
  const focused = payload.annotation.comments.filter(
    (comment) =>
      comment.content.trim() &&
      (comment.id === resolvedRootId || comment.replyTo === resolvedRootId),
  );
  if (focused.length > 0) return focused;
  return payload.annotation.comments.filter((comment) => comment.content.trim());
}

function formatCreateThoughtContext(annotation: Annotation) {
  const comments = annotation.comments.filter((comment) => comment.content.trim());
  if (comments.length === 0) return '- 暂无';
  return comments
    .map((comment) => `- ${formatCommentAuthor(comment)}: ${comment.content}`)
    .join('\n');
}

function agentMessageMaxTokens(payload: AgentMessagePayload) {
  return payload.responseMode === 'create_thought' ? 420 : 1200;
}

function buildAgentSelfInstruction(
  payload: AgentMessagePayload,
  currentAgent?: PromptAgentIdentity,
) {
  const username = currentAgent?.username || payload.agentUsername;
  const nickname = currentAgent?.nickname || username;
  const selfNames = [nickname, `@${username}`]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join('、');

  return `本轮发言者：${nickname}（@${username}）\n身份识别规则：读者评论里的 ${selfNames} 指向你本人。先判断读者是在询问你的批注、你的判断，还是在询问其他助手的观点。涉及自己的判断时，用自然的第一人称承接；涉及其他助手时，使用对方昵称或 @。\n历史断言规则：只有当前 thread 或 memory_view 明确提供对应证据时，才能说“我之前批注过”“我之前说过”或“其他助手批注过”；没有证据时，说当前上下文里没有看到。`;
}

function buildAgentMessageParticipants(
  payload: AgentMessagePayload,
  currentAgent?: PromptAgentIdentity,
) {
  const participants = new Map<string, string>();
  const currentUsername = currentAgent?.username || payload.agentUsername;
  const currentNickname = currentAgent?.nickname || currentUsername;

  addParticipant(participants, currentUsername, currentNickname, '当前发言助手');
  for (const agent of payload.agentRoster || []) {
    addParticipant(
      participants,
      agent.username,
      agent.nickname,
      agent.kind === 'review' ? '可被 @ 的审阅助手' : '可被 @ 的伴读助手',
    );
  }
  addCommentParticipant(participants, payload.annotation, '原批注作者');
  for (const comment of payload.annotation.comments) {
    addCommentParticipant(participants, comment, '评论作者');
  }

  return Array.from(participants.values()).join('\n') || '- 当前讨论暂无可识别参与者';
}

function addCommentParticipant(
  participants: Map<string, string>,
  item: Annotation | Comment,
  role: string,
) {
  if (item.author === 'ai') {
    addParticipant(participants, item.agentUsername || '', item.agentNickname || '', role);
    return;
  }
  addParticipant(participants, item.userUsername || '', item.userNickname || '', role);
}

function addParticipant(
  participants: Map<string, string>,
  username: string,
  nickname: string,
  role: string,
) {
  const display = nickname || username;
  const handle = username ? `@${username}` : '';
  if (!display && !handle) return;
  const key = username || display;
  if (participants.has(key)) return;
  participants.set(key, `- ${display}${handle ? `（${handle}）` : ''}：${role}`);
}

function formatThoughtReviewThreads(annotation: Annotation) {
  const roots = annotation.comments.filter((comment) => !comment.replyTo);
  const rootIds = new Set(roots.map((comment) => comment.id));
  const fallbackRootId = roots[0]?.id;
  const repliesByRoot = new Map(roots.map((comment) => [comment.id, [] as Comment[]]));

  for (const comment of annotation.comments) {
    if (!comment.replyTo) continue;
    const rootId = rootIds.has(comment.replyTo) ? comment.replyTo : fallbackRootId;
    if (!rootId) continue;
    repliesByRoot.get(rootId)?.push(comment);
  }

  return (
    roots
      .map((root, index) => {
        const replies = repliesByRoot.get(root.id) || [];
        const lines = [`${index + 1}. ${formatCommentAuthor(root)}: ${root.content}`];
        for (const reply of replies) {
          lines.push(`   - 回复 ${formatCommentAuthor(reply)}: ${reply.content}`);
        }
        return lines.join('\n');
      })
      .join('\n\n') || '- 暂无想法'
  );
}

function formatCommentAuthor(comment: Comment) {
  return comment.author === 'ai' ? formatAgentAuthor(comment) : formatUserAuthor(comment);
}

function formatAgentAuthor(comment: Comment) {
  if (comment.agentNickname && comment.agentUsername) {
    return `${comment.agentNickname} (@${comment.agentUsername})`;
  }
  return comment.agentNickname || (comment.agentUsername ? `@${comment.agentUsername}` : 'AI');
}

function formatUserAuthor(comment: Comment) {
  if (comment.userNickname && comment.userUsername) {
    return `${comment.userNickname} (@${comment.userUsername})`;
  }
  return comment.userNickname || formatUserMention(comment);
}

function formatUserMention(comment: Comment) {
  return comment.userUsername ? `@${comment.userUsername}` : '读者';
}
