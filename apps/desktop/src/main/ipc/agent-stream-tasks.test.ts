import { describe, expect, it, vi } from 'vitest';
import { createAgentStreamTasks } from './agent-stream-tasks';

describe('agent stream tasks', () => {
  it('aborts a running task when the renderer cancels it', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(1);
    const task = tasks.start(owner, 'agent:distillation-review:stream', 'request_1');

    expect(tasks.cancel(owner.id, 'agent:distillation-review:stream', 'request_1')).toBe(true);

    expect(task.signal.aborted).toBe(true);
    expect(task.isCancelled()).toBe(true);
    expect(tasks.activeCount()).toBe(0);
  });

  it('aborts every task owned by a destroyed renderer', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(2);
    const other = streamOwner(3);
    const firstTask = tasks.start(owner, 'agent:distillation-review:stream', 'request_1');
    const secondTask = tasks.start(owner, 'agent:distillation-review:stream', 'request_2');
    const otherTask = tasks.start(other, 'agent:distillation-review:stream', 'request_3');

    owner.destroy();

    expect(firstTask.signal.aborted).toBe(true);
    expect(secondTask.signal.aborted).toBe(true);
    expect(otherTask.signal.aborted).toBe(false);
    expect(tasks.activeCount()).toBe(1);
  });
});

function streamOwner(id: number) {
  const listeners = new Set<() => void>();
  return {
    id,
    isDestroyed: () => false,
    off: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
    once: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    destroy: () => {
      const pending = Array.from(listeners);
      listeners.clear();
      for (const listener of pending) listener();
    },
  };
}
