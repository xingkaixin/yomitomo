import { useEffectEvent, useReducer, useRef } from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { providerPresets } from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';
import { appToast } from '../shell/app-toast';
import { useTranslation } from 'react-i18next';
import { getDesktopApi } from '../shell/app-desktop-api';

export function useProviderModelFetch(
  draft: ProviderDraft,
  onChange: (draft: ProviderDraft) => void,
) {
  const { t } = useTranslation();
  const [{ loadingScope, modelError, modelNotice, modelOptions }, dispatch] = useReducer(
    modelFetchReducer,
    initialModelFetchState,
  );
  const readLatestDraft = useEffectEvent(() => draft);
  const modelRequestRef = useRef(0);
  useMountEffect(() => () => {
    modelRequestRef.current += 1;
  });
  const scope = providerModelScope(draft);
  const modelLoading = loadingScope === scope;
  const selectedPreset = providerPresets.find((preset) => preset.id === draft.presetId);
  const presetModels = selectedPreset?.modelNames || [];
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

  async function fetchModels() {
    const fallbackModels = selectedPreset?.modelNames || [];
    if (!draft.apiKey?.trim() && !draft.hasApiKey) {
      dispatch({ type: 'fetchSkipped' });
      appToast.warning(t('settings.models.apiKeyRequiredForModels'), {
        description:
          fallbackModels.length > 0 ? t('settings.models.presetModelsWithApiKey') : undefined,
      });
      if (fallbackModels.length > 0 && draft.modelNames === undefined) {
        const nextModelNames = fallbackModels;
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelName: nextModelNames.includes(draft.modelName || '')
            ? draft.modelName
            : nextModelNames[0],
          modelNames: nextModelNames,
        });
      }
      return;
    }
    const requestId = ++modelRequestRef.current;
    dispatch({ type: 'fetchStarted', scope });
    try {
      const models = await getDesktopApi().provider.listModels(draft);
      const latestDraft = readDraftInScope(requestId, scope);
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
      if (names.length > 0) {
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
      if (!readDraftInScope(requestId, scope)) return;
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
