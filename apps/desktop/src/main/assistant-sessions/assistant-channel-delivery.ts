import type { AgentReadingIntent, AssistantChannel, Comment } from '@yomitomo/shared';
import { agentReadingIntentOptions } from '@yomitomo/shared';
import { formatChannelMessage } from './assistant-channel-format';

export type AssistantDeliveryInput = {
  agentId: string;
  channel: AssistantChannel;
  quote?: string;
  messages: Comment[];
  anchorBlockId?: string;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
  reviewTargetCommentId?: string;
};

export function formatDelivery(input: AssistantDeliveryInput) {
  const intent = agentReadingIntentOptions.find((option) => option.value === input.readingIntent);
  return [
    deliveryHeader(input),
    input.messages.length > 0
      ? `${messageLabel(input.channel)}：\n${input.messages.map((message) => formatChannelMessage(message, input.agentId)).join('\n')}`
      : '',
    input.reviewTargetCommentId
      ? `请复核想法 [${input.reviewTargetCommentId}]：先判断它有没有原文依据、推理缺口、表达风险或可保留价值，再给出可执行的观点，不要改写读者的想法。`
      : '',
    input.instruction ? `读者的具体要求：${input.instruction}` : '',
    intent ? `阅读意图：${intent.label}。${intent.prompt}` : '',
    replyRequest(input.channel),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function deliveryHeader({ anchorBlockId, channel, quote }: AssistantDeliveryInput) {
  const place = anchorBlockId ? `（段落 ${anchorBlockId}）` : '';
  const original = quote?.trim() ? `划线原文：「${quote.trim()}」${place}` : '';
  if (channel.kind === 'thread') {
    return `【讨论串 ${channel.threadId}｜批注 ${channel.annotationId}】${original}`;
  }
  if (channel.kind === 'annotation') return `【批注 ${channel.annotationId}】${original}`;
  return `【问一问｜会话 ${channel.sessionId}】${original ? `读者最近选中的${original}` : ''}`;
}

function messageLabel(channel: AssistantChannel) {
  return channel.kind === 'annotation' ? '这条批注已有的想法' : '新消息';
}

function replyRequest(channel: AssistantChannel) {
  if (channel.kind === 'thread') return '请在这个讨论串里回复。';
  if (channel.kind === 'chat') return '请直接回答读者的问题。';
  return '请就这段原文写一条新的想法，它会作为新的讨论串发布：只写一个可带走的观点或判断框架，不要写成对话回复，不要 @ 任何人。';
}

export function formatRetraction(messageIds: string[]) {
  return `【系统通知】以下消息已被读者删除，视为作废，之后不要再引用：${messageIds.map((id) => `[${id}]`).join('、')}`;
}
