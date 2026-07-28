import type { DesktopIpcStreamChannel } from '../../ipc-contract';

// Structural on purpose: the registry only needs the renderer's identity and its
// destruction signal, not the whole WebContents surface.
type StreamTaskOwner = {
  id: number;
  off: (event: 'destroyed', listener: () => void) => unknown;
  once: (event: 'destroyed', listener: () => void) => unknown;
};
type StreamTaskState = 'cancelled' | 'failed' | 'finished' | 'running';

type StreamTask = {
  controller: AbortController;
  state: StreamTaskState;
  release: () => void;
};

/**
 * Binds a streaming AI task to the renderer that asked for it. A task reaches exactly one
 * terminal state, so a cancel racing a completion cannot emit twice, and a destroyed sender
 * cancels everything it owns instead of leaving the provider request running.
 */
export function createAgentStreamTasks() {
  const tasks = new Map<string, StreamTask>();

  function cancelOwnedBy(senderId: number) {
    for (const [key, task] of tasks) {
      if (!key.startsWith(`${senderId}:`)) continue;
      finalize(key, task, 'cancelled');
    }
  }

  function finalize(key: string, task: StreamTask, state: Exclude<StreamTaskState, 'running'>) {
    if (task.state !== 'running') return false;
    task.state = state;
    if (state === 'cancelled') task.controller.abort();
    tasks.delete(key);
    task.release();
    return true;
  }

  return {
    start(owner: StreamTaskOwner, channel: DesktopIpcStreamChannel, requestId: string) {
      const key = taskKey(owner.id, channel, requestId);
      const existing = tasks.get(key);
      if (existing) finalize(key, existing, 'cancelled');

      const controller = new AbortController();
      const onOwnerDestroyed = () => cancelOwnedBy(owner.id);
      owner.once('destroyed', onOwnerDestroyed);
      const task: StreamTask = {
        controller,
        state: 'running',
        release: () => owner.off('destroyed', onOwnerDestroyed),
      };
      tasks.set(key, task);

      return {
        signal: controller.signal,
        isCancelled: () => task.state === 'cancelled',
        finish: () => finalize(key, task, 'finished'),
        fail: () => finalize(key, task, 'failed'),
      };
    },
    cancel(senderId: number, channel: DesktopIpcStreamChannel, requestId: string) {
      const key = taskKey(senderId, channel, requestId);
      const task = tasks.get(key);
      return task ? finalize(key, task, 'cancelled') : false;
    },
    cancelOwnedBy,
    activeCount: () => tasks.size,
  };
}

function taskKey(senderId: number, channel: DesktopIpcStreamChannel, requestId: string) {
  return `${senderId}:${channel}:${requestId}`;
}

export type AgentStreamTasks = ReturnType<typeof createAgentStreamTasks>;
