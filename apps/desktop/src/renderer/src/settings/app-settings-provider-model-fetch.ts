import { useState } from 'react';
import { providerPresets } from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';
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
  const visibleModels =
    modelOptions.length > 0 ? modelOptions : draft.modelNames || selectedPreset?.modelNames || [];

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
      setModelNotice(
        fallbackModels.length > 0
          ? t('settings.models.presetModelsWithApiKey')
          : t('settings.models.apiKeyRequiredForModels'),
      );
      if (fallbackModels.length > 0) {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelName: fallbackModels.includes(draft.modelName || '')
            ? draft.modelName
            : fallbackModels[0],
          modelNames: fallbackModels,
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
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelName: names.includes(draft.modelName || '') ? draft.modelName : names[0],
          modelNames: names,
        });
      } else {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelNames: [],
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
    visibleModels,
  };
}
