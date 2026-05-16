import { useCallback, useState } from 'react';
import type { Agent, DesktopStore } from '@yomitomo/shared';

type UseAppAgentActionsInput = {
  applyStore: (nextStore: DesktopStore) => DesktopStore;
};

export function useAppAgentActions({ applyStore }: UseAppAgentActionsInput) {
  const [agentSaveError, setAgentSaveError] = useState('');
  const [agentSaveState, setAgentSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const toggleAgent = useCallback(
    async (agent: Agent) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      setAgentSaveState('saving');
      try {
        applyStore(
          await desktop.saveAgent({
            ...agent,
            enabled: !agent.enabled,
          }),
        );
        setAgentSaveError('');
        setAgentSaveState('saved');
        window.setTimeout(() => setAgentSaveState('idle'), 800);
      } catch (error) {
        setAgentSaveError(error instanceof Error ? error.message : '保存失败。');
        setAgentSaveState('idle');
      }
    },
    [applyStore],
  );

  return { agentSaveError, agentSaveState, toggleAgent };
}
