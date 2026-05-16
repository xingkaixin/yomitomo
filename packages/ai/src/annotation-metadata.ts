import type {
  AgentMentionInstruction,
  AgentMentionInstructionPayload,
  AnnotationMetadata,
  AnnotationMetadataPayload,
  LlmProvider,
} from '@yomitomo/shared';
import { agentReadingIntentOptions, normalizeAgentReadingIntent } from '@yomitomo/shared';
import { normalizeAnnotationType } from '@yomitomo/core';
import { parseJsonArray, parseJsonObject, stringValue } from './json';
import { callProviderText } from './provider-client';

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
