import { useCallback, useReducer } from 'react';
import type { Agent, DesktopStore } from '@yomitomo/shared';
import type { AgentStorePatch } from '../../../ipc-contract';
import i18next from 'i18next';
import { getDesktopApi } from './app-desktop-api';

type UseAppAgentActionsInput = {
  applySettingsPatch: (patch: AgentStorePatch) => DesktopStore;
};

type AgentSaveState = {
  agentSaveError: string;
  agentSaveState: 'idle' | 'saving' | 'saved';
};

type AgentSaveEvent =
  | { type: 'saveFailed'; error: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' }
  | { type: 'savedNoticeExpired' };

function agentSaveReducer(state: AgentSaveState, event: AgentSaveEvent): AgentSaveState {
  switch (event.type) {
    case 'saveFailed':
      return { agentSaveError: event.error, agentSaveState: 'idle' };
    case 'saveStarted':
      return { ...state, agentSaveState: 'saving' };
    case 'saveSucceeded':
      return { agentSaveError: '', agentSaveState: 'saved' };
    case 'savedNoticeExpired':
      return { ...state, agentSaveState: 'idle' };
  }
}

export function useAppAgentActions({ applySettingsPatch }: UseAppAgentActionsInput) {
  const [{ agentSaveError, agentSaveState }, dispatch] = useReducer(agentSaveReducer, {
    agentSaveError: '',
    agentSaveState: 'idle',
  });

  const toggleAgent = useCallback(
    async (agent: Agent) => {
      dispatch({ type: 'saveStarted' });
      try {
        applySettingsPatch(
          await getDesktopApi().agent.save({
            ...agent,
            enabled: !agent.enabled,
          }),
        );
        dispatch({ type: 'saveSucceeded' });
        window.setTimeout(() => dispatch({ type: 'savedNoticeExpired' }), 800);
      } catch (error) {
        dispatch({
          type: 'saveFailed',
          error: error instanceof Error ? error.message : i18next.t('common.saveFailed'),
        });
      }
    },
    [applySettingsPatch],
  );

  return { agentSaveError, agentSaveState, toggleAgent };
}
