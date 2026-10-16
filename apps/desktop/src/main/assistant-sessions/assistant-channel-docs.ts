import { defineDoc } from '@earendil-works/pi-durable';
import type { AssistantChannel } from '@yomitomo/shared';

export type AssistantRunRecord = {
  agentId: string;
  channel: AssistantChannel;
  forkId: number;
  delivery: string;
  deliveredIds: string[];
  readingIntent: string | null;
};

export function channelKey(channel: AssistantChannel) {
  return channel.kind === 'thread'
    ? `thread:${channel.threadId}`
    : `annotation:${channel.annotationId}`;
}

export function cursorKey(agentId: string, channel: AssistantChannel | string) {
  return `${agentId}|${typeof channel === 'string' ? channel : channelKey(channel)}`;
}

// The agent's own conversation in an article never generates; each delivery runs in a fork of
// it, and the finished exchange is written back so later forks remember it.
export const AgentConversationsDoc = defineDoc<{ conversations: Record<string, number> }>({
  kind: 'yomitomo.agent-conversations',
  version: 1,
  scope: 'session',
  initial: () => ({ conversations: {} }),
});

export const ChannelCursorsDoc = defineDoc<{ delivered: Record<string, string[]> }>({
  kind: 'yomitomo.channel-cursors',
  version: 1,
  scope: 'session',
  initial: () => ({ delivered: {} }),
});

export const ChannelRunsDoc = defineDoc<{ runs: Record<string, AssistantRunRecord> }>({
  kind: 'yomitomo.channel-runs',
  version: 1,
  scope: 'session',
  initial: () => ({ runs: {} }),
});
