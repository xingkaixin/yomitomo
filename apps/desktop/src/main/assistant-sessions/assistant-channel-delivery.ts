import type { AgentReadingIntent, Annotation, AssistantChannel, Comment } from '@yomitomo/shared';
import { agentReadingIntentOptions } from '@yomitomo/shared';
import { formatChannelMessage, threadComments } from './assistant-channel-format';

export type AssistantDeliveryInput = {
  agentId: string;
  channel: AssistantChannel;
  annotation: Annotation;
  messages: Comment[];
  anchorBlockId?: string;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
  reviewTargetCommentId?: string;
};

export function channelMessages(channel: AssistantChannel, annotation: Annotation) {
  const messages =
    channel.kind === 'thread'
      ? threadComments(annotation, channel.threadId)
      : annotation.comments.filter((comment) => !comment.replyTo && comment.content.trim());
  return messages.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function formatDelivery(input: AssistantDeliveryInput) {
  const { annotation, channel } = input;
  const place = input.anchorBlockId ? `（段落 ${input.anchorBlockId}）` : '';
  const header =
    channel.kind === 'thread'
      ? `【讨论串 ${channel.threadId}｜批注 ${annotation.id}】原文：「${annotation.anchor.exact.trim()}」${place}`
      : `【批注 ${annotation.id}】原文：「${annotation.anchor.exact.trim()}」${place}`;
  const intent = agentReadingIntentOptions.find((option) => option.value === input.readingIntent);
  const messageLabel = channel.kind === 'thread' ? '新消息' : '这条批注已有的想法';
  return [
    header,
    input.messages.length > 0
      ? `${messageLabel}：\n${input.messages.map((message) => formatChannelMessage(message, input.agentId)).join('\n')}`
      : '',
    input.reviewTargetCommentId
      ? `请复核想法 [${input.reviewTargetCommentId}]：先判断它有没有原文依据、推理缺口、表达风险或可保留价值，再给出可执行的观点，不要改写读者的想法。`
      : '',
    input.instruction ? `读者的具体要求：${input.instruction}` : '',
    intent ? `阅读意图：${intent.label}。${intent.prompt}` : '',
    channel.kind === 'thread'
      ? '请在这个讨论串里回复。'
      : '请就这段原文写一条新的想法，它会作为新的讨论串发布：只写一个可带走的观点或判断框架，不要写成对话回复，不要 @ 任何人。',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function formatRetraction(messageIds: string[]) {
  return `【系统通知】以下消息已被读者删除，视为作废，之后不要再引用：${messageIds.map((id) => `[${id}]`).join('、')}`;
}
