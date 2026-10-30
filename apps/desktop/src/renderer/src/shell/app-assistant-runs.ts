import { useMemo, useSyncExternalStore } from 'react';
import type {
  AssistantChannel,
  AssistantDeliveryRequest,
  AssistantRunEvent,
} from '@yomitomo/shared';
import { getDesktopApi, getOptionalDesktopApi } from './app-desktop-api';

export type AssistantRunView = AssistantRunEvent & { startedAt: string };

function listen(listener: (event: AssistantRunEvent) => void) {
  return getOptionalDesktopApi()?.assistant?.onRun?.(listener) ?? (() => undefined);
}

export async function deliverAssistantMessage(request: AssistantDeliveryRequest) {
  let runKey: string | null = null;
  const early: AssistantRunEvent[] = [];
  let resolveSettled!: (event: AssistantRunEvent) => void;
  const settled = new Promise<AssistantRunEvent>((resolve) => {
    resolveSettled = resolve;
  });
  // The run can settle before deliver() returns its key, so listen first and replay.
  const stop = listen((event) => {
    if (event.status === 'running') return;
    if (runKey === null) early.push(event);
    else if (event.runKey === runKey) finish(event);
  });
  function finish(event: AssistantRunEvent) {
    stop();
    resolveSettled(event);
  }
  try {
    ({ runKey } = await getDesktopApi().assistant.deliver(request));
  } catch (error) {
    stop();
    throw error;
  }
  if (!runKey) {
    stop();
    return null;
  }
  const settledEarly = early.find((event) => event.runKey === runKey);
  if (settledEarly) finish(settledEarly);
  return { runKey, settled };
}

// An annotation's thread and new-thought runs render in the same discussion window.
export function assistantRunScope(channel: AssistantChannel) {
  return channel.kind === 'chat'
    ? `chat:${channel.sessionId}`
    : `annotation:${channel.annotationId}`;
}

export function useAssistantRuns(articleId: string, scope: string) {
  // A new store per article and scope starts empty and reloads, like a remount would.
  const store = useMemo(() => createAssistantRunStore(articleId, scope), [articleId, scope]);
  const runs = useSyncExternalStore(store.subscribe, store.getRuns);
  return { runs, settle: store.settle };
}

function createAssistantRunStore(articleId: string, scope: string) {
  let runs: ReadonlyMap<string, AssistantRunView> = new Map();
  let runList: AssistantRunView[] = [];
  const listeners = new Set<() => void>();

  function replaceRuns(next: ReadonlyMap<string, AssistantRunView>) {
    if (next === runs) return;
    runs = next;
    runList = [...next.values()];
    for (const listener of listeners) listener();
  }

  function apply(events: AssistantRunEvent[], initial: boolean) {
    const next = new Map(runs);
    for (const event of events) {
      if (event.articleId !== articleId || assistantRunScope(event.channel) !== scope) continue;
      if (initial && next.has(event.runKey)) continue;
      if (event.status === 'failed' || (event.status === 'done' && !event.commentId)) {
        next.delete(event.runKey);
        continue;
      }
      const startedAt = runs.get(event.runKey)?.startedAt ?? new Date().toISOString();
      next.set(event.runKey, { ...event, startedAt });
    }
    replaceRuns(next);
  }

  return {
    getRuns: () => runList,
    // A finished run keeps its placeholder until the saved comment reaches this window.
    settle: (runKey: string) => {
      if (!runs.has(runKey)) return;
      const next = new Map(runs);
      next.delete(runKey);
      replaceRuns(next);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      let active = true;
      const stop = listen((event) => apply([event], false));
      void getOptionalDesktopApi()
        ?.assistant?.runs?.(articleId)
        .then((events) => {
          if (active) apply(events, true);
        })
        .catch(() => undefined);
      return () => {
        active = false;
        stop();
        listeners.delete(listener);
      };
    },
  };
}
