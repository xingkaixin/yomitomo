import { useEffect, useRef, useState } from 'react';
import type { PublicAgent } from '@yomitomo/shared';
import type { AgentDockItem } from './reader-types';

export function useAgentReadingDock(agents: PublicAgent[]) {
  const agentDockItemsRef = useRef<AgentDockItem[]>([]);
  const agentDockClearTimerRef = useRef<number | null>(null);
  const agentDockCompletingRef = useRef(false);
  const [agentDockCompleting, setAgentDockCompleting] = useState(false);
  const [agentDockItems, setAgentDockItems] = useState<AgentDockItem[]>([]);
  const [completionBurstKey, setCompletionBurstKey] = useState(0);

  useEffect(() => {
    updateAgentDockItems((items) =>
      items.flatMap((item) => {
        const agent = agents.find((candidate) => candidate.id === item.agent.id);
        return agent ? [{ ...item, agent }] : [];
      }),
    );
  }, [agents]);

  function clearAgentDockTimer() {
    if (agentDockClearTimerRef.current === null) return;
    window.clearTimeout(agentDockClearTimerRef.current);
    agentDockClearTimerRef.current = null;
  }

  function updateAgentDockItems(update: (items: AgentDockItem[]) => AgentDockItem[]) {
    const nextItems = update(agentDockItemsRef.current);
    agentDockItemsRef.current = nextItems;
    setAgentDockItems(nextItems);
    return nextItems;
  }

  function activateAgentDock(agent: PublicAgent) {
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
  }

  function markAgentDockDone(agentId: string) {
    updateAgentDockItems((items) =>
      items.map((item) => (item.agent.id === agentId ? { ...item, state: 'done' } : item)),
    );
  }

  function completeAgentDock(celebrate: boolean) {
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
  }

  function clearAgentDock() {
    clearAgentDockTimer();
    agentDockItemsRef.current = [];
    agentDockCompletingRef.current = false;
    setAgentDockItems([]);
    setAgentDockCompleting(false);
  }

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
