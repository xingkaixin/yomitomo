import { useState } from 'react';
import { providerPresets } from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';

export function useProviderModelFetch(
  draft: ProviderDraft,
  onChange: (draft: ProviderDraft) => void,
) {
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
          ? '已显示预设模型；填写 API Key 后可获取实时列表'
          : '填写 API Key 后可获取模型列表',
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
      setModelNotice(names.length > 0 ? `已获取 ${names.length} 个模型` : '未获取到模型列表');
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
      setModelError(error instanceof Error ? error.message : '获取模型列表失败');
      setModelNotice(fallbackModels.length > 0 ? '已显示预设模型作为候选' : '');
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
