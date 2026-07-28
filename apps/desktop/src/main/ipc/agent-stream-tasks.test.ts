import { describe, expect, it, vi } from 'vitest';
import { createAgentStreamTasks } from './agent-stream-tasks';

describe('agent stream tasks', () => {
  it('aborts a running task when the renderer cancels it', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(1);
    const task = tasks.start(owner, 'agent:comment:stream', 'request_1');

    expect(tasks.cancel(owner.id, 'agent:comment:stream', 'request_1')).toBe(true);

    expect(task.signal.aborted).toBe(true);
    expect(task.isCancelled()).toBe(true);
    expect(tasks.activeCount()).toBe(0);
  });

  it('aborts every task owned by a destroyed renderer', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(2);
    const other = streamOwner(3);
    const commentTask = tasks.start(owner, 'agent:comment:stream', 'request_1');
    const annotateTask = tasks.start(owner, 'agent:annotate:stream', 'request_2');
    const otherTask = tasks.start(other, 'agent:comment:stream', 'request_3');

    owner.destroy();

    expect(commentTask.signal.aborted).toBe(true);
    expect(annotateTask.signal.aborted).toBe(true);
    expect(otherTask.signal.aborted).toBe(false);
    expect(tasks.activeCount()).toBe(1);
  });

  it('reaches exactly one terminal state when a cancel races a completion', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(4);
    const task = tasks.start(owner, 'agent:comment:stream', 'request_1');

    expect(tasks.cancel(owner.id, 'agent:comment:stream', 'request_1')).toBe(true);
    expect(task.finish()).toBe(false);
    expect(task.fail()).toBe(false);
    expect(tasks.cancel(owner.id, 'agent:comment:stream', 'request_1')).toBe(false);
    expect(task.isCancelled()).toBe(true);
  });

  it('does not cancel a finished task', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(5);
    const task = tasks.start(owner, 'agent:comment:stream', 'request_1');

    expect(task.finish()).toBe(true);
    expect(tasks.cancel(owner.id, 'agent:comment:stream', 'request_1')).toBe(false);
    expect(task.signal.aborted).toBe(false);
    expect(task.isCancelled()).toBe(false);
  });

  it('cancels a superseded task that reuses one request id', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(6);
    const first = tasks.start(owner, 'agent:comment:stream', 'request_1');

    const second = tasks.start(owner, 'agent:comment:stream', 'request_1');

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(tasks.activeCount()).toBe(1);
  });

  it('stops listening for destruction once a task settles', () => {
    const tasks = createAgentStreamTasks();
    const owner = streamOwner(7);
    const task = tasks.start(owner, 'agent:comment:stream', 'request_1');

    task.finish();

    expect(owner.off).toHaveBeenCalledWith('destroyed', expect.any(Function));
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
