import { useCallback, useMemo, useReducer } from 'react';
import type { PublicAgent } from '@yomitomo/shared';

type PendingAnnotationAgentEntries = Record<
  string,
  Record<string, { agent: PublicAgent; count: number }>
>;

export type PendingAnnotationAgents = Record<string, PublicAgent[]>;

type PendingAnnotationAgentEvent =
  | { type: 'agentFinished'; annotationId: string; agentId: string }
  | { type: 'agentStarted'; annotationId: string; agent: PublicAgent }
  | { type: 'allCleared' }
  | { type: 'annotationCleared'; annotationId: string };

function pendingAnnotationAgentsReducer(
  current: PendingAnnotationAgentEntries,
  event: PendingAnnotationAgentEvent,
): PendingAnnotationAgentEntries {
  switch (event.type) {
    case 'agentFinished': {
      const currentAgents = current[event.annotationId];
      const currentEntry = currentAgents?.[event.agentId];
      if (!currentAgents || !currentEntry) return current;
      if (currentEntry.count > 1) {
        return {
          ...current,
          [event.annotationId]: {
            ...currentAgents,
            [event.agentId]: { ...currentEntry, count: currentEntry.count - 1 },
          },
        };
      }

      const nextAgents = { ...currentAgents };
      delete nextAgents[event.agentId];
      if (Object.keys(nextAgents).length > 0) {
        return { ...current, [event.annotationId]: nextAgents };
      }

      const next = { ...current };
      delete next[event.annotationId];
      return next;
    }
    case 'agentStarted': {
      const currentAgents = current[event.annotationId] || {};
      const currentEntry = currentAgents[event.agent.id];
      return {
        ...current,
        [event.annotationId]: {
          ...currentAgents,
          [event.agent.id]: {
            agent: event.agent,
            count: (currentEntry?.count || 0) + 1,
          },
        },
      };
    }
    case 'allCleared':
      return {};
    case 'annotationCleared': {
      if (!current[event.annotationId]) return current;
      const next = { ...current };
      delete next[event.annotationId];
      return next;
    }
  }
}

export function usePendingAnnotationAgents() {
  const [entries, dispatch] = useReducer(pendingAnnotationAgentsReducer, {});

  const pendingAnnotationAgents = useMemo<PendingAnnotationAgents>(() => {
    return Object.fromEntries(
      Object.entries(entries).map(([annotationId, agents]) => [
        annotationId,
        Object.values(agents).map((entry) => entry.agent),
      ]),
    );
  }, [entries]);

  const addPendingAnnotationAgent = useCallback(
    (annotationId: string, agent: PublicAgent) =>
      dispatch({ type: 'agentStarted', annotationId, agent }),
    [],
  );

  const removePendingAnnotationAgent = useCallback(
    (annotationId: string, agentId: string) =>
      dispatch({ type: 'agentFinished', annotationId, agentId }),
    [],
  );

  const clearPendingAnnotationAgents = useCallback(
    (annotationId: string) => dispatch({ type: 'annotationCleared', annotationId }),
    [],
  );

  const clearAllPendingAnnotationAgents = useCallback(() => dispatch({ type: 'allCleared' }), []);

  return {
    pendingAnnotationAgents,
    addPendingAnnotationAgent,
    removePendingAnnotationAgent,
    clearPendingAnnotationAgents,
    clearAllPendingAnnotationAgents,
  };
}
