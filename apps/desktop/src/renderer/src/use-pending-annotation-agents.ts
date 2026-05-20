import { useCallback, useMemo, useState } from 'react';
import type { PublicAgent } from '@yomitomo/shared';

type PendingAnnotationAgentEntries = Record<
  string,
  Record<string, { agent: PublicAgent; count: number }>
>;

export type PendingAnnotationAgents = Record<string, PublicAgent[]>;

export function usePendingAnnotationAgents() {
  const [entries, setEntries] = useState<PendingAnnotationAgentEntries>({});

  const pendingAnnotationAgents = useMemo<PendingAnnotationAgents>(() => {
    return Object.fromEntries(
      Object.entries(entries).map(([annotationId, agents]) => [
        annotationId,
        Object.values(agents).map((entry) => entry.agent),
      ]),
    );
  }, [entries]);

  const addPendingAnnotationAgent = useCallback((annotationId: string, agent: PublicAgent) => {
    setEntries((current) => {
      const currentAgents = current[annotationId] || {};
      const currentEntry = currentAgents[agent.id];
      return {
        ...current,
        [annotationId]: {
          ...currentAgents,
          [agent.id]: {
            agent,
            count: (currentEntry?.count || 0) + 1,
          },
        },
      };
    });
  }, []);

  const removePendingAnnotationAgent = useCallback((annotationId: string, agentId: string) => {
    setEntries((current) => {
      const currentAgents = current[annotationId];
      const currentEntry = currentAgents?.[agentId];
      if (!currentAgents || !currentEntry) return current;
      if (currentEntry.count > 1) {
        return {
          ...current,
          [annotationId]: {
            ...currentAgents,
            [agentId]: { ...currentEntry, count: currentEntry.count - 1 },
          },
        };
      }

      const nextAgents = { ...currentAgents };
      delete nextAgents[agentId];
      if (Object.keys(nextAgents).length > 0) return { ...current, [annotationId]: nextAgents };

      const next = { ...current };
      delete next[annotationId];
      return next;
    });
  }, []);

  const clearPendingAnnotationAgents = useCallback((annotationId: string) => {
    setEntries((current) => {
      if (!current[annotationId]) return current;
      const next = { ...current };
      delete next[annotationId];
      return next;
    });
  }, []);

  const clearAllPendingAnnotationAgents = useCallback(() => setEntries({}), []);

  return {
    pendingAnnotationAgents,
    addPendingAnnotationAgent,
    removePendingAnnotationAgent,
    clearPendingAnnotationAgents,
    clearAllPendingAnnotationAgents,
  };
}
