import type {
  AgentMentionAction,
  AgentMentionDirective,
  AgentMentionInstruction,
  AgentMentionInstructionPayload,
  AgentMentionRoutePlan,
  LlmProvider,
} from '@yomitomo/shared';
import { agentReadingIntentOptions, normalizeAgentReadingIntent } from '@yomitomo/shared';
import { booleanValue, parseJsonArray, parseJsonObject, stringArray, stringValue } from '../json';
import { callProviderText } from '../provider/provider-client';

export async function planAgentMentionInstructions(
  provider: LlmProvider,
  payload: AgentMentionInstructionPayload,
): Promise<AgentMentionInstruction[]> {
  return (await planAgentMentionRoute(provider, payload)).directives;
}

export async function planAgentMentionRoute(
  provider: LlmProvider,
  payload: AgentMentionInstructionPayload,
): Promise<AgentMentionRoutePlan> {
  const content = await callProviderText(provider, {
    system:
      '你是 Yomitomo 阅读器的 @ 助手语义路由器。根据用户文本判断是否应保存用户想法，并把每个被 @ 的助手应该执行的阅读动作拆开。只返回 JSON。',
    user: buildAgentMentionInstructionPrompt(payload),
    maxTokens: 900,
    temperature: 0,
  });
  return parseAgentMentionRoutePlan(content, payload.agents, payload.allowedActions);
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
  const actions = payload.allowedActions?.length
    ? payload.allowedActions
    : ['comment', 'create_thought'];
  const target = payload.targetAnchor
    ? `目标选区：\n${payload.targetAnchor.exact}`
    : `目标章节：${payload.targetSection?.sectionTitle || payload.targetSection?.sectionId || '未命名章节'}\n${payload.targetSection?.text || ''}`;

  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

${target}

用户文本：
${payload.note.trim() || '（用户只 @ 了助手）'}

被 @ 的助手：
${JSON.stringify(agents, null, 2)}

可选阅读动作：
${JSON.stringify(intents, null, 2)}

允许的执行动作：
${JSON.stringify(actions, null, 2)}

请返回 JSON 对象：
- createUserThought：布尔值。只有当用户文本里有自己的观点、问题、判断、困惑或笔记时才为 true；如果用户只是 @助手并下指令，则为 false。
- directives：数组，每个元素是一位助手的一项动作。

directives 每个元素字段：
- agentUsername：必须来自被 @ 的助手列表
- action：只能是允许动作之一。comment 表示在用户想法下回复；create_thought 表示围绕目标选区或章节创建一条新的助手批注。
- instruction：只写这个助手需要执行的具体指令，去掉 @ 称呼
- readingIntent：当用户明确要求解释、拆解、挑战、追问或联系全文时填写对应 value；动作由助手角色自行判断时省略

拆解规则：
- 没有 @ 助手时不应该调用本路由；若发生，返回 {"createUserThought":true,"directives":[]}。
- 用户确实写下自己的想法时，createUserThought 必须为 true；不要润色、提炼或替换用户原文。
- 用户只是在要求助手回应或写想法时，createUserThought 为 false。
- 当 createUserThought 为 false 且允许 create_thought 时，优先使用 create_thought，避免创建只有指令的用户想法。
- 单个助手前后的要求归给该助手。
- 多个助手共享的要求复制给每个助手。
- 用户给不同助手安排不同要求时分别拆开。
- 同一助手可以同时有 comment 和 create_thought 两个动作。
- 如果只允许 create_thought，所有 directives 的 action 都必须是 create_thought。

只返回 JSON，例如 {"createUserThought":true,"directives":[{"agentUsername":"林知微","action":"comment","instruction":"解释这个概念","readingIntent":"explain"},{"agentUsername":"周砚","action":"create_thought","instruction":"从反方角度提出一个不同想法","readingIntent":"challenge"}]}。`;
}

export function parseAgentMentionInstructions(
  content: string,
  agents: AgentMentionInstructionPayload['agents'],
): AgentMentionInstruction[] {
  return parseLegacyMentionInstructions(content, agents);
}

export function parseAgentMentionRoutePlan(
  content: string,
  agents: AgentMentionInstructionPayload['agents'],
  allowedActions?: AgentMentionAction[],
): AgentMentionRoutePlan {
  const parsed = parseJsonObject(content);
  const createUserThought = booleanValue(parsed.createUserThought) ?? true;
  const directives = parseMentionDirectiveRows(
    Array.isArray(parsed.directives) ? parsed.directives : [],
    agents,
    allowedActions,
  );
  return { createUserThought, directives };
}

function parseLegacyMentionInstructions(
  content: string,
  agents: AgentMentionInstructionPayload['agents'],
): AgentMentionInstruction[] {
  const parsed = parseJsonArray(content);
  const directives = parseMentionDirectiveRows(parsed, agents, ['comment']);
  const byAgentId = new Map(directives.map((directive) => [directive.agentId, directive]));

  return agents.map(
    (agent) =>
      byAgentId.get(agent.id) || {
        agentId: agent.id,
        agentUsername: agent.username,
        action: 'comment' as const,
      },
  );
}

function parseMentionDirectiveRows(
  parsed: unknown[],
  agents: AgentMentionInstructionPayload['agents'],
  allowedActions?: AgentMentionAction[],
): AgentMentionDirective[] {
  const byHandle = new Map(
    agents.flatMap((agent) => [[agent.username, agent] as const, [agent.nickname, agent] as const]),
  );
  const allowed = new Set<AgentMentionAction>(
    allowedActions?.length ? allowedActions : ['comment', 'create_thought'],
  );
  const directives: AgentMentionDirective[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const handle =
      stringValue(row.agentUsername) || stringValue(row.username) || stringValue(row.agent);
    const agent = byHandle.get(handle);
    if (!agent) continue;
    const actions = mentionActions(row, allowed);
    for (const action of actions) {
      const instruction =
        stringValue(row.instruction) ||
        stringValue(row[`${action}Instruction`]) ||
        stringValue(row.actionInstruction);
      const readingIntent = normalizeAgentReadingIntent(row.readingIntent);
      const key = `${agent.id}:${action}:${instruction}:${readingIntent || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      directives.push({
        agentId: agent.id,
        agentUsername: agent.username,
        action,
        instruction: instruction || undefined,
        readingIntent: readingIntent || undefined,
      });
    }
  }

  return directives;
}

function mentionActions(row: Record<string, unknown>, allowed: Set<AgentMentionAction>) {
  const values = stringArray(row.actions);
  const single = stringValue(row.action);
  if (single) values.unshift(single);
  const actions = values.filter(
    (value): value is AgentMentionAction =>
      (value === 'comment' || value === 'create_thought') && allowed.has(value),
  );
  if (actions.length > 0) return Array.from(new Set(actions));
  return allowed.has('comment') ? ['comment' as const] : ['create_thought' as const];
}
