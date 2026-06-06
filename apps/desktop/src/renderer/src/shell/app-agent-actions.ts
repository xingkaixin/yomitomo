import { useCallback, useState } from 'react';
import type { Agent, DesktopStore } from '@yomitomo/shared';
import i18next from 'i18next';

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
        setAgentSaveError(error instanceof Error ? error.message : i18next.t('common.saveFailed'));
        setAgentSaveState('idle');
      }
    },
    [applyStore],
  );

  return { agentSaveError, agentSaveState, toggleAgent };
}
