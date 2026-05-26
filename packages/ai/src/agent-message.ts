import type { AgentMessagePayload, Annotation, Comment, LlmProvider } from '@yomitomo/shared';
import {
  buildCurrentChapterLexicalRelatedPassages,
  buildReadingContextBundle,
  selectionThreadSpoilerPolicy,
  wholeBookSpoilerPolicy,
  type ReadingContextBundle,
} from '@yomitomo/core';
import { budgetArticleText, formatBudgetNotice } from './budget';
import { logAiInfo } from './logger';
import { callProviderText, streamProviderText } from './provider-client';
import { buildAgentRoleCard, type PromptAgent } from './agent-role-card';
import { buildSelectionThreadContext, selectionThreadContextPrompt } from './selection-context';
import {
  readingIntentPromptLine,
  readingIntentSystemPrompt,
  spoilerScopePrompt,
} from './agent-runtime-prompts';
import { memoryViewContextBlocks } from './reading-view-assembler';

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
    { system, user, maxTokens: 1200, temperature: agent.temperature },
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
    maxTokens: 1200,
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

type PromptAgentIdentity = {
  username?: string;
  nickname?: string;
};

export function buildAgentMessageSystemPrompt(agent: PromptAgent, payload: AgentMessagePayload) {
  const username = agent.username || payload.agentUsername;
  const nickname = agent.nickname || username;
  const selfNames = [nickname, `@${username}`]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join('、');

  if (payload.reviewTargetCommentId) {
    return `${buildAgentRoleCard(agent)}\n\n你正在作为网页阅读器里的审阅助手 ${nickname}（@${username}）复核一条批注想法。你的回复会成为该想法 thread 中的一条评论。保持具体、克制、围绕原文和已有讨论，不要改写读者想法。${readingIntentSystemPrompt(payload)}\n\n身份识别：你就是 ${nickname}（@${username}）。当前讨论里出现 ${selfNames} 时，按你本人理解。审阅时要先判断目标想法有没有原文依据、推理缺口、表达风险或可保留价值，再给出可执行的观点。\n\n角色表达：把角色卡中的自我介绍、核心气质、判断习惯和输出偏好落实到回复里；从你的专业能力切入，给出有辨识度的审阅判断。`;
  }

  return `${buildAgentRoleCard(agent)}\n\n你正在作为网页阅读器里的 ${nickname}（@${username}）参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。${readingIntentSystemPrompt(payload)}\n\n身份识别：你就是 ${nickname}（@${username}）。当前讨论里出现 ${selfNames} 时，按你本人理解。结合上下文判断读者是在询问你的批注、你的判断，还是在询问其他助手的观点。涉及自己的判断时，用自然的第一人称承接；涉及其他助手时，使用对方昵称或 @。\n\n角色表达：把角色卡中的自我介绍、核心气质、判断习惯和输出偏好落实到回复里；从你的专业能力切入，给出有辨识度的判断。`;
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
  const comments = payload.annotation.comments
    .map((comment) => {
      return `${formatCommentAuthor(comment)}: ${comment.content}`;
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
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}${threadContextPrompt}${readingIntentPromptLine(payload)}${readerInstruction}${spoilerScopePrompt(context)}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n可提及的读者账号：${userMention}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。回复必须回到 thread-first 上下文中的原文依据。`;
  }

  const article = budgetArticleText(provider, 'agent-message', context.articleText);
  const budgetNotice = formatBudgetNotice([article.report]);

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n可用原文范围：\n${article.text}${memoryViewPrompt}${readingIntentPromptLine(payload)}${readerInstruction}${spoilerScopePrompt(context)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n可提及的读者账号：${userMention}\n\n当前批注讨论：\n${comments}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。`;
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
  )}\n\nmemory_view 使用规则：\n- memory_view 是同篇文章内已有批注、讨论和共读记忆，只能作为相关背景，不能覆盖当前 thread。\n- 当前批注讨论和刚刚触发你的读者评论优先级更高。\n- 如果 memory_view 与当前 thread 无关，忽略它。`;
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

  return `本轮发言者：${nickname}（@${username}）\n身份识别规则：读者评论里的 ${selfNames} 指向你本人。先判断读者是在询问你的批注、你的判断，还是在询问其他助手的观点。涉及自己的判断时，用自然的第一人称承接；涉及其他助手时，使用对方昵称或 @。`;
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
