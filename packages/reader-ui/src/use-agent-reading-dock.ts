import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicAgent } from '@yomitomo/shared';
import type { AgentDockItem } from './reader-types';

export function useAgentReadingDock(agents: PublicAgent[]) {
  const agentDockItemsRef = useRef<AgentDockItem[]>([]);
  const agentDockClearTimerRef = useRef<number | null>(null);
  const agentDockCompletingRef = useRef(false);
  const [agentDockCompleting, setAgentDockCompleting] = useState(false);
  const [agentDockItems, setAgentDockItems] = useState<AgentDockItem[]>([]);
  const [completionBurstKey, setCompletionBurstKey] = useState(0);

  const clearAgentDockTimer = useCallback(() => {
    if (agentDockClearTimerRef.current === null) return;
    window.clearTimeout(agentDockClearTimerRef.current);
    agentDockClearTimerRef.current = null;
  }, []);

  const updateAgentDockItems = useCallback(
    (update: (items: AgentDockItem[]) => AgentDockItem[]) => {
      const nextItems = update(agentDockItemsRef.current);
      agentDockItemsRef.current = nextItems;
      setAgentDockItems(nextItems);
      return nextItems;
    },
    [],
  );

  useEffect(() => {
    updateAgentDockItems((items) =>
      items.flatMap((item) => {
        const agent = agents.find((candidate) => candidate.id === item.agent.id);
        return agent ? [{ ...item, agent }] : [];
      }),
    );
  }, [agents, updateAgentDockItems]);

  const activateAgentDock = useCallback(
    (agent: PublicAgent) => {
      clearAgentDockTimer();
      agentDockCompletingRef.current = false;
      setAgentDockCompleting(false);
      updateAgentDockItems((items) => {
        const existingIndex = items.findIndex((item) => item.agent.id === agent.id);
        if (existingIndex === -1) return [...items, { agent, state: 'active' }];
        return items.map((item, index) =>
          index === existingIndex ? { agent, state: 'active' } : item,
        );
      });
    },
    [clearAgentDockTimer, updateAgentDockItems],
  );

  const markAgentDockDone = useCallback(
    (agentId: string) => {
      updateAgentDockItems((items) =>
        items.map((item) => (item.agent.id === agentId ? { ...item, state: 'done' } : item)),
      );
    },
    [updateAgentDockItems],
  );

  const completeAgentDock = useCallback(
    (celebrate: boolean) => {
      const items = agentDockItemsRef.current;
      if (items.length === 0 || agentDockCompletingRef.current) return;
      agentDockCompletingRef.current = true;
      setAgentDockCompleting(celebrate);
      if (celebrate) setCompletionBurstKey((key) => key + 1);
      clearAgentDockTimer();
      agentDockClearTimerRef.current = window.setTimeout(
        () => {
          agentDockCompletingRef.current = false;
          setAgentDockCompleting(false);
          updateAgentDockItems(() => []);
          agentDockClearTimerRef.current = null;
        },
        celebrate ? 1900 : 700,
      );
    },
    [clearAgentDockTimer, updateAgentDockItems],
  );

  const clearAgentDock = useCallback(() => {
    clearAgentDockTimer();
    agentDockItemsRef.current = [];
    agentDockCompletingRef.current = false;
    setAgentDockItems([]);
    setAgentDockCompleting(false);
  }, [clearAgentDockTimer]);

  return {
    agentDockCompleting,
    agentDockItems,
    completionBurstKey,
    activateAgentDock,
    markAgentDockDone,
    completeAgentDock,
    clearAgentDock,
  };
}
