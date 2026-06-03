import type { ReadingContextBundle } from '@yomitomo/core';
import type { AgentAnnotatePayload, AgentMessagePayload } from '@yomitomo/shared';
import { agentReadingIntentOptions } from '@yomitomo/shared';

function readingIntentOption(payload: AgentAnnotatePayload | AgentMessagePayload) {
  return agentReadingIntentOptions.find((option) => option.value === payload.readingIntent);
}

export function readingIntentSystemPrompt(payload: AgentAnnotatePayload | AgentMessagePayload) {
  const option = readingIntentOption(payload);
  return option ? `\n\n${option.prompt}` : '';
}

export function readingIntentPromptLine(payload: AgentAnnotatePayload | AgentMessagePayload) {
  const option = readingIntentOption(payload);
  return option ? `\n\n本轮阅读动作：${option.label}\n动作说明：${option.description}` : '';
}

export function spoilerScopePrompt(context: ReadingContextBundle) {
  if (context.spoilerPolicy.allowedScope === 'whole-book') return '';
  return '\n\n防剧透范围：可用证据已经按读者进度裁剪。只使用提供的可用原文、目标选区和讨论内容；不要引用、概括或推断未提供的后文章节、剧情或论证。';
}

export function instructionPromptLine(payload: AgentAnnotatePayload) {
  return payload.instruction ? `\n读者指导：${payload.instruction}` : '';
}
