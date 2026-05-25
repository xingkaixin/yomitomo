import type { Annotation } from '@yomitomo/shared';
import { agentQueueKey } from './reader-annotations';

export class AgentAnnotationQueue {
  private readonly queues = new Map<string, Annotation[]>();
  private order: string[] = [];
  private lastPlayedKey: string | null = null;

  enqueue(annotation: Annotation) {
    const key = agentQueueKey(annotation);
    const queue = this.queues.get(key) || [];
    queue.push(annotation);
    this.queues.set(key, queue);
    if (!this.order.includes(key)) this.order.push(key);
    return key;
  }

  count() {
    let count = 0;
    for (const queue of this.queues.values()) count += queue.length;
    return count;
  }

  hasQueuedForAgent(agentId: string) {
    return (this.queues.get(agentId)?.length || 0) > 0;
  }

  hasQueuedForOtherAgent(agentId: string) {
    for (const [key, queue] of this.queues) {
      if (key !== agentId && queue.length > 0) return true;
    }
    return false;
  }

  dequeueNext() {
    const key = this.nextKey();
    const annotation = key ? this.queues.get(key)?.shift() : undefined;
    if (!key || !annotation) return null;
    this.lastPlayedKey = key;
    return { key, annotation };
  }

  cleanup(agentId: string | null, hasVirtualReadingSession: boolean) {
    if (!agentId || hasVirtualReadingSession) return false;
    const queue = this.queues.get(agentId);
    if (queue && queue.length > 0) return false;
    this.queues.delete(agentId);
    this.order = this.order.filter((key) => key !== agentId);
    if (this.lastPlayedKey === agentId) this.lastPlayedKey = null;
    return true;
  }

  shouldWaitForPeerReading(agentId: string, hasUnfinishedPeerReading: boolean) {
    return !this.hasQueuedForOtherAgent(agentId) && hasUnfinishedPeerReading;
  }

  private nextKey() {
    if (this.order.length === 0) return null;

    const lastIndex = this.lastPlayedKey ? this.order.indexOf(this.lastPlayedKey) : -1;
    for (let index = 1; index <= this.order.length; index += 1) {
      const key = this.order[(lastIndex + index + this.order.length) % this.order.length];
      if ((this.queues.get(key)?.length || 0) > 0) return key;
    }
    return null;
  }
}
