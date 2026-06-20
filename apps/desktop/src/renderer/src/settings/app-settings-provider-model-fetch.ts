import { useState } from 'react';
import { providerPresets } from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';
import { appToast } from '../shell/app-toast';
import { useTranslation } from 'react-i18next';

export function useProviderModelFetch(
  draft: ProviderDraft,
  onChange: (draft: ProviderDraft) => void,
) {
  const { t } = useTranslation();
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [modelNotice, setModelNotice] = useState('');
  const selectedPreset = providerPresets.find((preset) => preset.id === draft.presetId);
  const presetModels = selectedPreset?.modelNames || [];
  const storedVisibleModels = draft.modelNames === undefined ? presetModels : draft.modelNames;
  const fetchedVisibleModels = modelOptions.filter(
    (modelName) => !presetModels.includes(modelName) || storedVisibleModels.includes(modelName),
  );
  const visibleModels = mergeModelNames(storedVisibleModels, fetchedVisibleModels);

  function clearModelStatus() {
    setModelOptions([]);
    setModelError('');
    setModelNotice('');
  }

  async function fetchModels() {
    const fallbackModels = selectedPreset?.modelNames || [];
    if (!window.yomitomoDesktop) return;
    if (!draft.apiKey?.trim() && !draft.hasApiKey) {
      setModelError('');
      setModelNotice('');
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
    setModelLoading(true);
    setModelError('');
    setModelNotice('');
    try {
      const models = await window.yomitomoDesktop.listProviderModels(draft);
      const names = models.map((model) => model.id).filter(Boolean);
      setModelOptions(names);
      setModelNotice(
        names.length > 0
          ? t('settings.models.fetchedModels', { count: names.length })
          : t('settings.models.noModelsFetched'),
      );
      if (names.length > 0) {
        const baseModelNames = draft.modelNames === undefined ? fallbackModels : draft.modelNames;
        const nextModelNames = mergeModelNames(
          baseModelNames,
          names.filter(
            (modelName) =>
              !fallbackModels.includes(modelName) || baseModelNames.includes(modelName),
          ),
        );
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelName: nextModelNames.includes(draft.modelName || '')
            ? draft.modelName
            : nextModelNames[0],
          modelNames: nextModelNames,
        });
      } else {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelNames: draft.modelNames === undefined ? fallbackModels : draft.modelNames,
        });
      }
    } catch (error) {
      setModelError(
        error instanceof Error ? error.message : t('settings.models.fetchModelsFailed'),
      );
      setModelNotice(fallbackModels.length > 0 ? t('settings.models.presetModelsFallback') : '');
    } finally {
      setModelLoading(false);
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
