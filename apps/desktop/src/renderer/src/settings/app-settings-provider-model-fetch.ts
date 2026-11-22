import { useQueryClient } from '@tanstack/react-query';
import { useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { isChatGptOAuthProvider, providerPresets } from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';
import { appToast } from '../shell/app-toast';
import { useTranslation } from 'react-i18next';
import { getDesktopApi } from '../shell/app-desktop-api';

export function useProviderModelFetch(
  draft: ProviderDraft,
  onChange: (draft: ProviderDraft) => void,
  options?: { chatGptConnected?: boolean },
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [{ loadingScope, modelError, modelNotice, modelOptions }, dispatch] = useReducer(
    modelFetchReducer,
    initialModelFetchState,
  );
  const readLatestDraft = useStableCallback(() => draft);
  const modelRequestRef = useRef(0);
  useMountEffect(() => () => {
    modelRequestRef.current += 1;
  });
  const scope = providerModelScope(draft);
  const modelLoading = loadingScope === scope;
  const selectedPreset = providerPresets.find((preset) => preset.id === draft.presetId);
  const isChatGpt = isChatGptOAuthProvider(draft);
  const presetModels = isChatGpt ? [] : selectedPreset?.modelNames || [];
  const storedVisibleModels = draft.modelNames === undefined ? presetModels : draft.modelNames;
  const fetchedVisibleModels = modelOptions.filter(
    (modelName) => !presetModels.includes(modelName) || storedVisibleModels.includes(modelName),
  );
  const visibleModels = mergeModelNames(storedVisibleModels, fetchedVisibleModels);

  function clearModelStatus() {
    dispatch({ type: 'statusCleared' });
  }

  // Models fetched for another provider, endpoint or key must not reach the current draft.
  function readDraftInScope(requestId: number, requestScope: string) {
    if (requestId !== modelRequestRef.current) return null;
    const latestDraft = readLatestDraft();
    if (providerModelScope(latestDraft) === requestScope) return latestDraft;
    dispatch({ type: 'fetchAbandoned' });
    return null;
  }

  async function fetchModels(fetchOptions?: { draft?: ProviderDraft; forceConnected?: boolean }) {
    const targetDraft = fetchOptions?.draft ?? draft;
    const targetIsChatGpt = isChatGptOAuthProvider(targetDraft);
    const targetPreset = providerPresets.find((preset) => preset.id === targetDraft.presetId);
    const targetScope = providerModelScope(targetDraft);
    const fallbackModels = targetIsChatGpt ? [] : targetPreset?.modelNames || [];
    const missingAuth = targetIsChatGpt
      ? !(fetchOptions?.forceConnected || options?.chatGptConnected)
      : !targetDraft.apiKey?.trim() && !targetDraft.hasApiKey;
    if (missingAuth) {
      dispatch({ type: 'fetchSkipped' });
      appToast.warning(
        targetIsChatGpt
          ? t('settings.models.chatGptSignInRequiredForModels')
          : t('settings.models.apiKeyRequiredForModels'),
        {
          description:
            fallbackModels.length > 0
              ? targetIsChatGpt
                ? t('settings.models.presetModelsWithChatGpt')
                : t('settings.models.presetModelsWithApiKey')
              : undefined,
        },
      );
      if (fallbackModels.length > 0 && targetDraft.modelNames === undefined) {
        const nextModelNames = fallbackModels;
        onChange({
          ...targetDraft,
          modelInputMode: 'list',
          modelName: nextModelNames.includes(targetDraft.modelName || '')
            ? targetDraft.modelName
            : nextModelNames[0],
          modelNames: nextModelNames,
        });
      }
      return;
    }
    const requestId = ++modelRequestRef.current;
    dispatch({ type: 'fetchStarted', scope: targetScope });
    try {
      const models = await getDesktopApi().provider.listModels(targetDraft);
      void queryClient.invalidateQueries({ queryKey: ['provider', 'thinking-levels'] });
      const latestDraft = readDraftInScope(requestId, targetScope);
      if (!latestDraft) return;
      const names = models.map((model) => model.id).filter(Boolean);
      dispatch({
        type: 'fetchSucceeded',
        names,
        notice:
          names.length > 0
            ? t('settings.models.fetchedModels', { count: names.length })
            : t('settings.models.noModelsFetched'),
      });
      if (isChatGptOAuthProvider(latestDraft)) {
        onChange({
          ...latestDraft,
          modelInputMode: 'list',
          modelName: names.includes(latestDraft.modelName || '')
            ? latestDraft.modelName
            : names[0] || '',
          modelNames: names,
        });
      } else if (names.length > 0) {
        const baseModelNames =
          latestDraft.modelNames === undefined ? fallbackModels : latestDraft.modelNames;
        const nextModelNames = mergeModelNames(
          baseModelNames,
          names.filter(
            (modelName) =>
              !fallbackModels.includes(modelName) || baseModelNames.includes(modelName),
          ),
        );
        onChange({
          ...latestDraft,
          modelInputMode: 'list',
          modelName: nextModelNames.includes(latestDraft.modelName || '')
            ? latestDraft.modelName
            : nextModelNames[0],
          modelNames: nextModelNames,
        });
      } else {
        onChange({
          ...latestDraft,
          modelInputMode: 'list',
          modelNames:
            latestDraft.modelNames === undefined ? fallbackModels : latestDraft.modelNames,
        });
      }
    } catch (error) {
      if (!readDraftInScope(requestId, targetScope)) return;
      dispatch({
        type: 'fetchFailed',
        error: error instanceof Error ? error.message : t('settings.models.fetchModelsFailed'),
        notice: fallbackModels.length > 0 ? t('settings.models.presetModelsFallback') : '',
      });
    }
  }

  return {
    fetchModels,
    clearModelStatus,
    modelError,
    modelLoading,
    modelNotice,
    presetModels,
    visibleModels,
  };
}

type ModelFetchState = {
  loadingScope: string | null;
  modelError: string;
  modelNotice: string;
  modelOptions: string[];
};

type ModelFetchEvent =
  | { type: 'fetchAbandoned' }
  | { type: 'fetchFailed'; error: string; notice: string }
  | { type: 'fetchSkipped' }
  | { type: 'fetchStarted'; scope: string }
  | { type: 'fetchSucceeded'; names: string[]; notice: string }
  | { type: 'statusCleared' };

const initialModelFetchState: ModelFetchState = {
  loadingScope: null,
  modelError: '',
  modelNotice: '',
  modelOptions: [],
};

function modelFetchReducer(state: ModelFetchState, event: ModelFetchEvent): ModelFetchState {
  switch (event.type) {
    case 'fetchAbandoned':
      return { ...state, loadingScope: null };
    case 'fetchFailed':
      return { ...state, loadingScope: null, modelError: event.error, modelNotice: event.notice };
    case 'fetchSkipped':
      return { ...state, modelError: '', modelNotice: '' };
    case 'fetchStarted':
      return { ...state, loadingScope: event.scope, modelError: '', modelNotice: '' };
    case 'fetchSucceeded':
      return {
        ...state,
        loadingScope: null,
        modelNotice: event.notice,
        modelOptions: event.names,
      };
    case 'statusCleared':
      return { ...state, modelError: '', modelNotice: '', modelOptions: [] };
  }
}

function providerModelScope(draft: ProviderDraft) {
  return JSON.stringify([
    draft.id,
    draft.cloneApiKeyFromProviderId,
    draft.presetId,
    draft.type,
    draft.baseUrl,
    draft.apiKey,
    draft.hasApiKey,
  ]);
}

function mergeModelNames(...groups: Array<readonly string[]>) {
  const names: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const modelName = item.trim();
      if (!modelName || names.includes(modelName)) continue;
      names.push(modelName);
    }
  }
  return names;
}
