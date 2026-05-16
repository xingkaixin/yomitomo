import { describe, expect, it } from 'vitest';
import type { Annotation } from '@yomitomo/shared';
import { AgentAnnotationQueue } from './reader-agent-annotation-queue';

function annotation(id: string, agentId: string): Annotation {
  return {
    id,
    anchor: { exact: id, prefix: '', suffix: '', start: 0, end: id.length },
    author: 'ai',
    color: '#54cda0',
    agentId,
    comments: [],
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  };
}

describe('AgentAnnotationQueue', () => {
  it('dequeues annotations in round-robin agent order', () => {
    const queue = new AgentAnnotationQueue();

    queue.enqueue(annotation('a1', 'agent_1'));
    queue.enqueue(annotation('a2', 'agent_1'));
    queue.enqueue(annotation('b1', 'agent_2'));

    expect(queue.dequeueNext()?.annotation.id).toBe('a1');
    expect(queue.dequeueNext()?.annotation.id).toBe('b1');
    expect(queue.dequeueNext()?.annotation.id).toBe('a2');
  });

  it('removes empty agent keys during cleanup', () => {
    const queue = new AgentAnnotationQueue();
    queue.enqueue(annotation('a1', 'agent_1'));

    expect(queue.dequeueNext()?.key).toBe('agent_1');
    expect(queue.cleanup('agent_1', true)).toBe(false);
    expect(queue.cleanup('agent_1', false)).toBe(true);
  });

  it('waits for peer reading only when no peer annotation is queued', () => {
    const queue = new AgentAnnotationQueue();
    queue.enqueue(annotation('a1', 'agent_1'));
    queue.enqueue(annotation('b1', 'agent_2'));

    const first = queue.dequeueNext();
    expect(first?.key).toBe('agent_1');
    expect(queue.shouldWaitForPeerReading('agent_1', true)).toBe(false);

    expect(queue.dequeueNext()?.key).toBe('agent_2');
    expect(queue.shouldWaitForPeerReading('agent_2', true)).toBe(true);
  });
});
