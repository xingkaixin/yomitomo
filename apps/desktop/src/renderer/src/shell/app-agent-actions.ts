import { useCallback, useState } from 'react';
import type { Agent, DesktopStore } from '@yomitomo/shared';
import type { AgentStorePatch } from '../../../ipc-contract';
import i18next from 'i18next';
import { getDesktopApi } from './app-desktop-api';

type UseAppAgentActionsInput = {
  applySettingsPatch: (patch: AgentStorePatch) => DesktopStore;
};

export function useAppAgentActions({ applySettingsPatch }: UseAppAgentActionsInput) {
  const [agentSaveError, setAgentSaveError] = useState('');
  const [agentSaveState, setAgentSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const toggleAgent = useCallback(
    async (agent: Agent) => {
      setAgentSaveState('saving');
      try {
        applySettingsPatch(
          await getDesktopApi().agent.save({
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
    [applySettingsPatch],
  );

  return { agentSaveError, agentSaveState, toggleAgent };
}
