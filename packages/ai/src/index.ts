import type {
  Agent,
  AgentAnnotatePayload,
  AgentMentionInstruction,
  AgentMentionInstructionPayload,
  AgentMessagePayload,
  AgentPersonality,
  Annotation,
  AnnotationMetadata,
  AnnotationMetadataPayload,
  ArticleRecord,
  Comment,
  FocusCoReadingRoutePayload,
  FocusCoReadingRouteResult,
  LlmProvider,
  ReadingDeliberationRecord,
  ReadingCardReviewRecord,
  ReadingCardRecord,
  ReadingCardReviewerResult,
} from '@yomitomo/shared';
import {
  agentPersonalities,
  agentReadingIntentOptions,
  normalizeAgentReadingIntent,
} from '@yomitomo/shared';
import {
  annotationDensityInstruction,
  buildReadingQuestions,
  createAgentAnnotation,
  normalizeAnnotationType,
  parseAnnotationSuggestions,
  type ReadingCardEvidenceUnit,
} from '@yomitomo/core';
import { logAiError, logAiInfo } from './logger';
import {
  budgetArticleText,
  budgetDeliberationJson,
  budgetEvidenceJson,
  budgetReadingCardJson,
  formatBudgetNotice,
} from './budget';
import { callProviderText, streamProviderText } from './provider-client';

export {
  budgetArticleText,
  budgetDeliberationJson,
  budgetEvidenceJson,
  budgetReadingCardJson,
  formatBudgetNotice,
  normalizeAnthropicError,
  type ModelBudgetReport,
  type ModelInputTask,
} from './budget';
export {
  callProviderText,
  listProviderModels,
  streamProviderText,
  type GenerateOptions,
  type TextPayload,
} from './provider-client';
export { setAiLogger, type AiLogger } from './logger';

export type GenerateReadingCardInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  readingDeliberation?: ReadingDeliberationRecord;
};

export type GenerateReadingDeliberationInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
};

export type ReviewReadingCardInput = GenerateReadingCardInput & {
  readingCard: ReadingCardRecord;
  previousReview?: ReadingCardReviewRecord;
  reviewAgentIds?: string[];
};

export type ReviewReadingCardResult = Pick<
  ReadingCardReviewerResult,
  'status' | 'verdict' | 'summary' | 'findings' | 'acceptedClaims' | 'missingAngles' | 'rawResponse'
>;

export async function testProvider(
  provider: LlmProvider,
): Promise<{ ok: boolean; message: string }> {
  try {
    const content = await callProviderText(provider, {
      system: 'You are a connectivity test assistant.',
      user: 'Reply with OK only.',
      maxTokens: 128,
    });
    return { ok: true, message: content };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Provider 测试失败' };
  }
}

export async function inferAnnotationMetadata(
  provider: LlmProvider,
  payload: AnnotationMetadataPayload,
): Promise<AnnotationMetadata> {
  const content = await callProviderText(provider, {
    system:
      '你是 Yomitomo 阅读器的批注标签器。根据用户选区和批注内容，选择最贴切的批注类型和阅读动作。只返回 JSON。',
    user: buildAnnotationMetadataPrompt(payload),
    maxTokens: 240,
    temperature: 0,
  });
  return parseAnnotationMetadata(content);
}

export async function planAgentMentionInstructions(
  provider: LlmProvider,
  payload: AgentMentionInstructionPayload,
): Promise<AgentMentionInstruction[]> {
  const content = await callProviderText(provider, {
    system:
      '你是 Yomitomo 阅读器的 @ 助手任务拆解器。根据用户文本，把每个被 @ 的助手应该执行的阅读任务拆开。只返回 JSON。',
    user: buildAgentMentionInstructionPrompt(payload),
    maxTokens: 900,
    temperature: 0,
  });
  return parseAgentMentionInstructions(content, payload.agents);
}

export async function planFocusCoReadingRoute(
  provider: LlmProvider,
  payload: FocusCoReadingRoutePayload,
  agents: Agent[],
): Promise<FocusCoReadingRouteResult> {
  const selectedAgents = agents.filter((agent) => payload.selectedAgentIds.includes(agent.id));
  if (selectedAgents.length === 0) throw new Error('请选择参与共读的助手');

  const content = await callProviderText(provider, {
    system:
      '你是 Yomitomo 的聚焦共读任务路由。根据文章章节和助手角色卡，为章节补充摘要、标签，并给出章节级助手分配。只返回 JSON。',
    user: buildFocusCoReadingRoutePrompt(payload, selectedAgents),
    maxTokens: 3200,
    temperature: 0.2,
  });

  return parseFocusCoReadingRouteResult(content, payload, selectedAgents);
}

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

export async function runAgentAnnotate(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
): Promise<Annotation[]> {
  const system = buildAgentAnnotateSystemPrompt(agent, payload);
  const content = await callProviderText(provider, {
    system,
    user: buildAgentAnnotatePrompt(provider, payload, agent),
    maxTokens: 4000,
    temperature: agent.temperature,
  });
  const suggestions = parseAnnotationSuggestions(content);
  const now = new Date().toISOString();

  return suggestions.flatMap((suggestion) => {
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
    );
    return annotation ? [annotation] : [];
  });
}

export async function runAgentAnnotateStream(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  onAnnotation: (annotation: Annotation) => void,
): Promise<void> {
  const system = buildAgentAnnotateSystemPrompt(agent, payload);
  const flushJson = (json: string) => {
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
      );
      if (annotation) {
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
      user: buildAgentAnnotateStreamPrompt(provider, payload, agent),
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
}

export function extractJsonObjects(input: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let restStart = input.length;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (start < 0) {
      if (char === '{') {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        objects.push(input.slice(start, index + 1).trim());
        start = -1;
        restStart = index + 1;
      }
    }
  }

  return { objects, rest: input.slice(start >= 0 ? start : restStart) };
}

function hasIncompleteJson(input: string) {
  return input
    .replace(/^```(?:json)?/m, '')
    .replace(/```$/m, '')
    .trim()
    .startsWith('{');
}

export async function generateReadingCard(provider: LlmProvider, input: GenerateReadingCardInput) {
  const system =
    '你是 Yomitomo 的读后笔记生成器。你的任务是基于文章全文、读者批注和讨论证据生成一篇可保存的读后笔记。你使用产品级整理策略，保持克制、准确、有判断力；不要套用任何批注助手的人格或口吻。必须区分文章观点、读者关注、助手补充。所有判断都要能回到原文或证据单元。';

  return callProviderText(provider, {
    system,
    user: buildReadingCardPrompt(provider, input),
    maxTokens: 3000,
    temperature: 0.35,
  });
}

export async function generateReadingDeliberation(
  provider: LlmProvider,
  input: GenerateReadingDeliberationInput,
) {
  const system =
    '你是 Yomitomo 的阅读审议编辑。你的任务是基于文章全文、读者批注、助手批注和评论 thread，整理这场阅读讨论已经形成的判断、分歧、证据强弱和未决问题。保持中立、具体、可追溯，所有判断都要能回到原文或证据单元。';

  return callProviderText(provider, {
    system,
    user: buildReadingDeliberationPrompt(provider, input),
    maxTokens: 3600,
    temperature: 0.3,
  });
}

export async function reviewReadingCard(
  provider: LlmProvider,
  agent: Agent,
  input: ReviewReadingCardInput,
): Promise<ReviewReadingCardResult> {
  const system = `${agent.soul}\n\n你是 Yomitomo 的读后笔记审核助手。你要审当前读后笔记和证据之间的关系，重点检查事实归因、证据链、覆盖度、压缩质量和后续行动价值。保持你的审核倾向，但输出必须克制、可执行、能回到原文或证据单元。`;
  const rawResponse = await callProviderText(
    provider,
    {
      system,
      user: buildReviewReadingCardPrompt(provider, input),
      maxTokens: 6000,
      temperature: agent.temperature,
    },
    { failOnMaxTokens: true },
  );
  return normalizeReadingCardReviewResponse(rawResponse);
}

function readingIntentOption(payload: AgentAnnotatePayload | AgentMessagePayload) {
  return agentReadingIntentOptions.find((option) => option.value === payload.readingIntent);
}

function readingIntentSystemPrompt(payload: AgentAnnotatePayload | AgentMessagePayload) {
  const option = readingIntentOption(payload);
  return option ? `\n\n${option.prompt}` : '';
}

function readingIntentPromptLine(payload: AgentAnnotatePayload | AgentMessagePayload) {
  const option = readingIntentOption(payload);
  return option ? `\n\n本轮阅读动作：${option.label}\n动作说明：${option.description}` : '';
}

type PromptAgent = {
  presetId?: string;
  soul: string;
  username?: string;
  nickname?: string;
};

type PromptAgentIdentity = {
  username?: string;
  nickname?: string;
};

function findAgentPersonality(agent: PromptAgent) {
  return agentPersonalities.find(
    (personality) => personality.id === agent.presetId || personality.soul === agent.soul,
  );
}

function buildAgentRoleCard(agent: PromptAgent) {
  const personality = findAgentPersonality(agent);
  const nickname = agent.nickname || personality?.name || agent.username || '伴读助手';
  const username = agent.username || nickname;
  const lines = [
    '## 角色卡',
    `- 当前身份：${nickname}（@${username}）`,
    ...buildPresetRoleLines(personality),
    '',
    '## 角色灵魂',
    agent.soul,
  ];
  return lines.filter((line) => line !== null).join('\n');
}

function buildPresetRoleLines(personality?: AgentPersonality) {
  if (!personality) return [];

  return [
    `- 预设身份：${personality.name}，${personality.roleTitle}`,
    `- 角色类型：${personality.kind}`,
    `- 性别设定：${personality.gender}`,
    `- 身份摘要：${personality.description}`,
    `- 公开介绍：${personality.introduction}`,
    personality.selfIntroduction ? `- 自我介绍：\n${personality.selfIntroduction}` : null,
    `- 场景设定：${personality.sceneDescription}`,
    `- 画像线索：${personality.portraitPrompt}`,
    `- 阅读场景线索：${personality.scenePrompt}`,
  ].filter((line): line is string => Boolean(line));
}

export function buildAgentMessageSystemPrompt(agent: PromptAgent, payload: AgentMessagePayload) {
  const username = agent.username || payload.agentUsername;
  const nickname = agent.nickname || username;
  const selfNames = [nickname, `@${username}`]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join('、');

  return `${buildAgentRoleCard(agent)}\n\n你正在作为网页阅读器里的 ${nickname}（@${username}）参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。${readingIntentSystemPrompt(payload)}\n\n身份识别：你就是 ${nickname}（@${username}）。当前讨论里出现 ${selfNames} 时，按你本人理解。结合上下文判断读者是在询问你的批注、你的判断，还是在询问其他助手的观点。涉及自己的判断时，用自然的第一人称承接；涉及其他助手时，使用对方昵称或 @。\n\n角色表达：把角色卡中的自我介绍、核心气质、判断习惯和输出偏好落实到回复里；从你的专业能力切入，给出有辨识度的判断。`;
}

function annotationTypePromptLine(payload: AgentAnnotatePayload) {
  return payload.annotationType ? `\n本轮批注类型：${payload.annotationType}` : '';
}

function instructionPromptLine(payload: AgentAnnotatePayload) {
  return payload.instruction ? `\n读者指导：${payload.instruction}` : '';
}

function buildAgentAnnotateSystemPrompt(agent: Agent, payload: AgentAnnotatePayload) {
  const scope = payload.targetAnchor
    ? `你正在作为网页阅读器里的 @${agent.username} 对读者选中的文本创建批注。批注只围绕目标选区本身展开。`
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

function readingPlanPrompt(payload: AgentAnnotatePayload) {
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
      sectionText: payload.article.text.slice(item.sectionStart, item.sectionEnd),
    };
  });

  return `\n\n本轮聚焦共读编排：\n${JSON.stringify(plan, null, 2)}\n\n编排要求：\n- 你可以阅读全文来理解上下文。\n- 只在编排列表里的 sectionText 内选择批注片段。\n- sectionSummary 和 sectionTag 用于帮助你快速定位章节重点。\n- readerMessages 是读者给本章节或给你的留言，请作为阅读关注点。\n- readingIntent 为空时，你根据原文、留言和角色卡自行选择每条批注的 readingIntent。\n- readingIntent 有值时，每条批注使用该章节对应的 readingIntent。\n- 输出的 exact 必须来自对应 sectionText 的连续原文。\n- 没有讨论价值的章节可以不输出。`;
}

export function buildAgentPrompt(
  provider: LlmProvider,
  payload: AgentMessagePayload,
  agent?: PromptAgentIdentity,
) {
  const comments = payload.annotation.comments
    .map((comment) => {
      const author =
        comment.author === 'ai' ? formatAgentAuthor(comment) : formatUserAuthor(comment);
      return `${author}: ${comment.content}`;
    })
    .join('\n');
  const userMention = formatUserMention(payload.userComment);
  const article = budgetArticleText(provider, 'agent-message', payload.article.text);
  const budgetNotice = formatBudgetNotice([article.report]);
  const participants = buildAgentMessageParticipants(payload, agent);
  const selfInstruction = buildAgentSelfInstruction(payload, agent);

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n全文：\n${article.text}${readingIntentPromptLine(payload)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n讨论参与者：\n${participants}\n\n${selfInstruction}\n\n可提及的读者账号：${userMention}\n\n当前批注讨论：\n${comments}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。`;
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
    addParticipant(participants, agent.username, agent.nickname, '可被 @ 的伴读助手');
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

function buildAgentAnnotatePrompt(
  provider: LlmProvider,
  payload: AgentAnnotatePayload,
  agent: Agent,
) {
  const planPrompt = readingPlanPrompt(payload);
  if (planPrompt) {
    const article = budgetArticleText(provider, 'agent-annotate', payload.article.text);
    const budgetNotice = formatBudgetNotice([article.report]);
    const readingIntentOutputLine =
      '- readingIntent：章节 readingIntent 有值时必须等于该值；章节 readingIntent 为空时，从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作';
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n全文：\n${article.text}${planPrompt}\n\n请返回 JSON 数组。每个元素包含：\n- exact：必须是对应章节中的原文连续片段，逐字一致\n- prefix：exact 前方 10-40 个字，来自文章原文\n- suffix：exact 后方 10-40 个字，来自文章原文\n- type：只允许 key_point、assumption、concept、question、quote\n${readingIntentOutputLine}\n- comment：结合章节内容、读者留言和你的角色判断写给读者的批注评论\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity)}\n\n类型含义：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n只返回 JSON，不要输出 Markdown。`;
  }
  if (payload.targetAnchor) {
    const readingIntentOutputLine = payload.readingIntent
      ? '- readingIntent：必须等于本轮阅读动作的值'
      : '- readingIntent：从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作';
    const commentOutputLine = payload.readingIntent
      ? '- comment：按本轮阅读动作和读者指导写给读者的批注评论'
      : '- comment：按读者指导和你的角色判断写给读者的批注评论';
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n目标选区：\n${payload.targetAnchor.exact}${readingIntentPromptLine(payload)}${annotationTypePromptLine(payload)}${instructionPromptLine(payload)}\n\n请针对目标选区返回 JSON 数组，数组中放 1 个元素。元素包含：\n- exact：必须等于目标选区原文，逐字一致\n- type：使用本轮批注类型；未指定时只允许 key_point、assumption、concept、question、quote\n${readingIntentOutputLine}\n${commentOutputLine}\n\n只返回 JSON，不要输出 Markdown。`;
  }
  const article = budgetArticleText(provider, 'agent-annotate', payload.article.text);
  const budgetNotice = formatBudgetNotice([article.report]);
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n全文：\n${article.text}${readingIntentPromptLine(payload)}\n\n请返回 JSON 数组。每个元素包含：\n- exact：必须是文章中的原文连续片段，逐字一致\n- prefix：exact 前方 10-40 个字，来自文章原文\n- suffix：exact 后方 10-40 个字，来自文章原文\n- type：只允许 key_point、assumption、concept、question、quote\n- comment：按本轮阅读动作说明这段为什么值得讨论，作为批注里的第一条评论\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity)}\n\n类型含义：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n选择标准：只挑符合本轮阅读动作且有讨论价值的文本；没有价值可以返回空数组。\n\n只返回 JSON，不要输出 Markdown。`;
}

function buildAgentAnnotateStreamPrompt(
  provider: LlmProvider,
  payload: AgentAnnotatePayload,
  agent: Agent,
) {
  const planPrompt = readingPlanPrompt(payload);
  if (planPrompt) {
    const article = budgetArticleText(provider, 'agent-annotate', payload.article.text);
    const budgetNotice = formatBudgetNotice([article.report]);
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n全文：\n${article.text}${planPrompt}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{"exact":"对应章节中的原文连续片段","prefix":"exact 前方 10-40 个字","suffix":"exact 后方 10-40 个字","type":"key_point","readingIntent":"explain","comment":"结合章节内容、读者留言和角色判断写成的批注评论"}\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity)}\n\n类型只允许：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n要求：\n- exact 必须来自对应 sectionText 的连续原文，逐字一致\n- prefix 和 suffix 必须来自 exact 周围的文章原文，用于区分重复文本\n- readingIntent：章节 readingIntent 有值时必须等于该值；章节 readingIntent 为空时，从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作\n- 每发现一条值得批注的内容，就立刻输出一行 JSON\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
  }
  if (payload.targetAnchor) {
    const readingIntentOutputLine = payload.readingIntent
      ? '- readingIntent：必须等于本轮阅读动作的值'
      : '- readingIntent：从 explain、decompose、challenge、question、connect 中选择最符合本条批注的动作';
    const commentOutputLine = payload.readingIntent
      ? '- comment：按本轮阅读动作和读者指导写给读者的批注评论'
      : '- comment：按读者指导和你的角色判断写给读者的批注评论';
    return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n目标选区：\n${payload.targetAnchor.exact}${readingIntentPromptLine(payload)}${annotationTypePromptLine(payload)}${instructionPromptLine(payload)}\n\n请针对目标选区返回 1 行 NDJSON，格式为：{"exact":"目标选区原文","type":"key_point","readingIntent":"explain","comment":"批注评论"}\n\n要求：\n- exact 必须等于目标选区原文，逐字一致\n- type 使用本轮批注类型；未指定时从 key_point、assumption、concept、question、quote 中选择\n${readingIntentOutputLine}\n${commentOutputLine}\n- 只输出 1 个 JSON 对象，不要输出 Markdown，不要输出数组。`;
  }
  const article = budgetArticleText(provider, 'agent-annotate', payload.article.text);
  const budgetNotice = formatBudgetNotice([article.report]);
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n${budgetNotice}\n\n全文：\n${article.text}${readingIntentPromptLine(payload)}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{"exact":"文章中的原文连续片段","prefix":"exact 前方 10-40 个字","suffix":"exact 后方 10-40 个字","type":"key_point","comment":"按本轮阅读动作说明这段为什么值得讨论"}\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity)}\n\n类型只允许：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n选择标准：只挑符合本轮阅读动作且有讨论价值的文本；没有价值可以不输出任何行。\n\n要求：\n- exact 必须是文章中的原文连续片段，逐字一致\n- prefix 和 suffix 必须来自 exact 周围的文章原文，用于区分重复文本\n- type 必须从允许值中选择\n- 每发现一条值得批注的内容，就立刻输出一行 JSON\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
}

function buildReadingCardPrompt(provider: LlmProvider, input: GenerateReadingCardInput) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    questionStatus: unit.questionStatus || '',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    annotationBody: unit.annotationBody
      ? {
          author: unit.annotationBody.authorLabel,
          questionStatus: unit.annotationBody.questionStatus || '',
          content: unit.annotationBody.content,
        }
      : null,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      questionStatus: comment.questionStatus || '',
      content: comment.content,
    })),
  }));
  const questions = buildReadingQuestions(input.article).map((question) => ({
    id: question.id,
    status: question.status,
    author: question.authorLabel,
    text: question.text,
    quote: question.quote,
  }));
  const deliberation = input.readingDeliberation
    ? {
        id: input.readingDeliberation.id,
        markdown: input.readingDeliberation.contentMarkdown,
        sections: input.readingDeliberation.sections,
      }
    : null;
  const articleText = budgetArticleText(provider, 'reading-card', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-card', evidence);
  const deliberationJson = deliberation
    ? budgetDeliberationJson('reading-card', deliberation)
    : { text: '暂无', report: null };
  const budgetNotice = formatBudgetNotice(
    [articleText.report, evidenceJson.report, deliberationJson.report].filter(
      (report) => report !== null,
    ),
  );

  return `请基于全文和证据单元生成一篇中文 Markdown 读后笔记。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

问题状态：
${JSON.stringify(questions, null, 2)}

阅读审议：
${deliberationJson.text}

输出要求：
- 直接输出 Markdown，不要输出代码块。
- 不要写“文章快照”。
- 不要复述全文概要。
- 每条关键判断尽量标注证据编号，例如 [#1]。
- 保留读者自己的关注点，标明“我”或读者昵称。
- 助手观点和文章观点分开表达。
- 如果有阅读审议，优先吸收其中的共识、分歧、证据强弱和未决问题。
- 保留未决问题状态：open 作为待推进问题，answered 作为已收束问题，parked 作为暂不推进问题。
- 内容要精炼、有层次，适合作为读后笔记保存。

固定结构：
# ${input.article.title}

## 核心主张
用 1-2 句话说清文章最重要的判断。

## 我关注了什么
按主题归并读者批注和评论，每条带原文证据编号。

## 讨论中浮现了什么
整理共识、分歧、未回答问题。来源来自评论 thread。

## 可复用洞见
提炼 3-5 条可以迁移到其他阅读或决策里的洞见。

## 后续行动线索
列出后续阅读、验证假设或可执行动作。`;
}

function buildReadingDeliberationPrompt(
  provider: LlmProvider,
  input: GenerateReadingDeliberationInput,
) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    questionStatus: unit.questionStatus || '',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    annotationBody: unit.annotationBody
      ? {
          author: unit.annotationBody.authorLabel,
          questionStatus: unit.annotationBody.questionStatus || '',
          content: unit.annotationBody.content,
        }
      : null,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      questionStatus: comment.questionStatus || '',
      content: comment.content,
    })),
  }));
  const questions = buildReadingQuestions(input.article).map((question) => ({
    id: question.id,
    status: question.status,
    author: question.authorLabel,
    text: question.text,
    quote: question.quote,
  }));
  const articleText = budgetArticleText(provider, 'reading-deliberation', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-deliberation', evidence);
  const budgetNotice = formatBudgetNotice([articleText.report, evidenceJson.report]);

  return `请生成一份中文 Markdown 阅读审议。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

问题状态：
${JSON.stringify(questions, null, 2)}

输出要求：
- 直接输出 Markdown，不要输出代码块。
- 每个关键判断尽量标注证据编号，例如 [#1]。
- 区分文章观点、读者关注、助手补充和评论 thread。
- 聚焦这场阅读讨论形成了什么判断，避免复述全文。
- 对证据薄弱、归因不清或仍需验证的内容明确指出。
- 单独汇总问题状态：open 是未决问题，answered 是已回答问题，parked 是搁置问题。

固定结构：
# ${input.article.title}｜阅读审议

## 共识
整理文章、读者和助手之间已经形成的主要共识。

## 分歧与张力
整理不同批注或评论之间的分歧、冲突、可挑战前提。

## 证据强弱
列出证据较强的判断和证据较弱的判断，说明依据。

## 未决问题
优先列出 open 问题，并简要说明对应证据；再用短句概括 answered 和 parked 问题。

## 给读后笔记的建议
说明生成读后笔记时应该保留、压缩或谨慎处理的内容。`;
}

function buildReviewReadingCardPrompt(provider: LlmProvider, input: ReviewReadingCardInput) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const card = {
    id: input.readingCard.id,
    sections: input.readingCard.sections,
    markdown: input.readingCard.contentMarkdown,
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    questionStatus: unit.questionStatus || '',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    annotationBody: unit.annotationBody
      ? {
          author: unit.annotationBody.authorLabel,
          questionStatus: unit.annotationBody.questionStatus || '',
          content: unit.annotationBody.content,
        }
      : null,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      questionStatus: comment.questionStatus || '',
      content: comment.content,
    })),
  }));
  const articleText = budgetArticleText(provider, 'reading-card-review', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-card-review', evidence);
  const cardJson = budgetReadingCardJson('reading-card-review', card);
  const budgetNotice = formatBudgetNotice([
    articleText.report,
    evidenceJson.report,
    cardJson.report,
  ]);

  return `请审核这篇读后笔记，返回一个 JSON 对象。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

读后笔记：
${cardJson.text}

审核维度：
- 证据链：关键判断是否能对应文章原文或证据单元。
- 归因：文章观点、读者关注、助手讨论是否表达清楚。
- 覆盖：高价值批注和评论是否被合理吸收。
- 压缩质量：是否保留有效判断，去除空泛复述。
- 行动线索：后续行动是否具体、能执行、和阅读材料有关。

输出 JSON 格式：
{
  "verdict": "pass",
  "summary": "整体审核结论，80 字以内",
  "findings": [
    {
      "section": "核心主张",
      "severity": "high",
      "problem": "问题描述",
      "evidenceIds": [1, 2],
      "suggestedRewrite": "可选，给出更好的改写"
    }
  ],
  "acceptedClaims": ["保留得好的判断"],
  "missingAngles": ["建议补充的视角"]
}

约束：
- verdict 只允许 pass 或 revise；存在高风险事实、归因或证据问题时使用 revise。
- severity 只允许 high、medium、low。
- evidenceIds 使用证据单元 id；没有对应证据时返回空数组。
- 文本字段里引用证据时统一写成 [#1] 这种格式；evidenceIds 仍返回数字数组。
- findings 最多 6 条，acceptedClaims 最多 4 条，missingAngles 最多 4 条。
- 只输出 JSON 对象，不要输出 Markdown。`;
}

function normalizeReadingCardReviewResponse(rawResponse: string): ReviewReadingCardResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(rawResponse);
  } catch (error) {
    logAiError('reading_card.review.parse_error', error, {
      rawLength: rawResponse.length,
      rawPreview: rawResponse.slice(0, 1200),
      rawTail: rawResponse.slice(-500),
    });
    return {
      status: 'error',
      verdict: 'revise',
      summary: '审核助手返回的内容格式异常，已保留原始输出供排查。',
      findings: [
        {
          section: '整篇笔记',
          severity: 'high',
          problem: '审稿结果 JSON 解析失败，当前这位审核助手的结构化结论无法可靠读取。',
          evidenceIds: [],
        },
      ],
      acceptedClaims: [],
      missingAngles: [],
      rawResponse,
    };
  }
  return {
    verdict: parsed.verdict === 'pass' ? 'pass' : 'revise',
    summary: stringValue(parsed.summary).slice(0, 300),
    findings: Array.isArray(parsed.findings)
      ? parsed.findings.slice(0, 6).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const finding = item as Record<string, unknown>;
          const problem = stringValue(finding.problem).slice(0, 500);
          if (!problem) return [];
          return [
            {
              section: stringValue(finding.section).slice(0, 80),
              severity:
                finding.severity === 'high' || finding.severity === 'low'
                  ? finding.severity
                  : 'medium',
              problem,
              evidenceIds: numberArray(finding.evidenceIds).slice(0, 8),
              suggestedRewrite: stringValue(finding.suggestedRewrite).slice(0, 800) || undefined,
            },
          ];
        })
      : [],
    acceptedClaims: stringArray(parsed.acceptedClaims).slice(0, 4),
    missingAngles: stringArray(parsed.missingAngles).slice(0, 4),
    rawResponse,
  };
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
    throw new Error('审稿结果不是有效 JSON');
  }
}

function parseJsonArray(value: string): unknown[] {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    }
    throw new Error('助手任务拆解结果不是有效 JSON');
  }
}

function buildAnnotationMetadataPrompt(payload: AnnotationMetadataPayload) {
  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

用户选区：
${payload.anchor.exact}

用户批注：
${payload.note.trim() || '（用户未填写批注）'}

请返回 JSON 对象，字段如下：
- annotationType：只允许 key_point、assumption、concept、question、quote
- readingIntent：只允许 explain、decompose、challenge、question、connect

类型含义：
- key_point：关键判断或强论点
- assumption：前提、漏洞、可挑战处
- concept：概念解释需求
- question：延伸问题
- quote：金句或可复用表达

阅读动作含义：
- explain：解释这段在说什么
- decompose：拆解结构和因果
- challenge：挑战前提或漏洞
- question：提出后续问题
- connect：连接经验、案例或上下文

只返回 JSON，例如 {"annotationType":"key_point","readingIntent":"explain"}。`;
}

function buildAgentMentionInstructionPrompt(payload: AgentMentionInstructionPayload) {
  const agents = payload.agents.map((agent) => ({
    agentId: agent.id,
    agentUsername: agent.username,
    nickname: agent.nickname,
    personalityName: agent.personalityName,
  }));
  const intents = agentReadingIntentOptions.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
  }));

  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

目标选区：
${payload.targetAnchor.exact}

用户文本：
${payload.note.trim() || '（用户只 @ 了助手）'}

被 @ 的助手：
${JSON.stringify(agents, null, 2)}

可选阅读动作：
${JSON.stringify(intents, null, 2)}

请返回 JSON 数组，每个元素对应一个被 @ 的助手：
- agentUsername：必须来自被 @ 的助手列表
- instruction：只写这个助手需要执行的具体指令，去掉 @ 称呼
- readingIntent：当用户明确要求解释、拆解、挑战、追问或联系全文时填写对应 value；动作由助手角色自行判断时省略

拆解规则：
- 单个助手前后的要求归给该助手。
- 多个助手共享的要求复制给每个助手。
- 用户给不同助手安排不同要求时分别拆开。

只返回 JSON，例如 [{"agentUsername":"林知微","instruction":"解释这个概念","readingIntent":"explain"}]。`;
}

function buildFocusCoReadingRoutePrompt(payload: FocusCoReadingRoutePayload, agents: Agent[]) {
  const routeAgents = agents.map((agent) => ({
    agentId: agent.id,
    agentUsername: agent.username,
    nickname: agent.nickname,
    roleCard: buildAgentRoleCard(agent),
  }));
  const sections = payload.sections.map((section, index) => ({
    index: index + 1,
    sectionId: section.sectionId,
    sectionTitle: section.sectionTitle,
    text: compactRouteSectionText(
      payload.article.text.slice(section.sectionStart, section.sectionEnd),
    ),
  }));

  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

可分配助手：
${JSON.stringify(routeAgents, null, 2)}

章节清单：
${JSON.stringify(sections, null, 2)}

请返回 JSON 对象，字段如下：
{
  "sections": [
    {
      "sectionId": "来自章节清单的 sectionId",
      "summary": "一句话说明该章节在说什么",
      "tag": "2 到 6 个字的内容标签",
      "agentIds": ["来自可分配助手的 agentId"]
    }
  ]
}

路由规则：
- agentIds 只使用可分配助手里的 agentId。
- 每个章节可以返回空数组，也可以分配多位助手，按内容需要决定。
- 内容密度低、过渡性强、重复说明的章节可以返回空数组。
- 论证型章节优先给擅长逻辑、前提、因果和反证的助手。
- 概念型章节优先给擅长解释术语、背景和定义的助手。
- 结构型章节优先给擅长梳理全文位置和章节功能的助手。
- 沉淀型章节优先给擅长提炼要点、金句和可迁移洞见的助手。
- 分配要尊重助手角色卡，避免把所有助手集中到同一章节。

只返回 JSON。`;
}

function compactRouteSectionText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 1200) return normalized;
  return `${normalized.slice(0, 900)}……${normalized.slice(-240)}`;
}

function parseAnnotationMetadata(content: string): AnnotationMetadata {
  const parsed = parseJsonObject(content);
  const annotationType = normalizeAnnotationType(parsed.annotationType);
  const readingIntent = normalizeAgentReadingIntent(parsed.readingIntent);
  if (!annotationType || !readingIntent) throw new Error('批注标签结果无效');
  return { annotationType, readingIntent };
}

export function parseAgentMentionInstructions(
  content: string,
  agents: AgentMentionInstructionPayload['agents'],
): AgentMentionInstruction[] {
  const parsed = parseJsonArray(content);
  const byHandle = new Map(
    agents.flatMap((agent) => [[agent.username, agent] as const, [agent.nickname, agent] as const]),
  );
  const byAgentId = new Map<string, AgentMentionInstruction>();

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const handle =
      stringValue(row.agentUsername) || stringValue(row.username) || stringValue(row.agent);
    const agent = byHandle.get(handle);
    if (!agent || byAgentId.has(agent.id)) continue;
    const instruction = stringValue(row.instruction);
    const readingIntent = normalizeAgentReadingIntent(row.readingIntent);
    byAgentId.set(agent.id, {
      agentId: agent.id,
      agentUsername: agent.username,
      instruction: instruction || undefined,
      readingIntent: readingIntent || undefined,
    });
  }

  return agents.map(
    (agent) =>
      byAgentId.get(agent.id) || {
        agentId: agent.id,
        agentUsername: agent.username,
      },
  );
}

export function parseFocusCoReadingRouteResult(
  content: string,
  payload: FocusCoReadingRoutePayload,
  agents: Pick<Agent, 'id'>[],
): FocusCoReadingRouteResult {
  const parsed = parseJsonObject(content);
  const sectionRows = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sectionIds = new Set(payload.sections.map((section) => section.sectionId));
  const agentIds = new Set(agents.map((agent) => agent.id));
  const seen = new Set<string>();
  const sections: FocusCoReadingRouteResult['sections'] = [];

  for (const item of sectionRows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const sectionId = stringValue(row.sectionId);
    if (!sectionId || !sectionIds.has(sectionId) || seen.has(sectionId)) continue;
    seen.add(sectionId);
    const rawAgentIds = Array.isArray(row.agentIds) ? row.agentIds : [];
    const assignedAgentIds = uniqueStrings(rawAgentIds.map((value) => stringValue(value))).filter(
      (agentId) => agentIds.has(agentId),
    );
    sections.push({
      sectionId,
      summary: stringValue(row.summary) || undefined,
      tag: stringValue(row.tag) || undefined,
      agentIds: assignedAgentIds,
    });
  }

  return { sections };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text.slice(0, 500)] : [];
      })
    : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];
}
