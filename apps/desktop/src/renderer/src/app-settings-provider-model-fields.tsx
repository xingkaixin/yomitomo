import { Keyboard, RefreshCw } from 'lucide-react';
import type { ProviderDraft } from './app-settings';
import { Field } from './app-ui';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';

export function ProviderModelFields({
  draft,
  modelError,
  modelLoading,
  modelNotice,
  selectContentClassName,
  visibleModels,
  onChange,
  onFetchModels,
  onUseCustomModel,
}: {
  draft: ProviderDraft;
  modelError: string;
  modelLoading: boolean;
  modelNotice: string;
  selectContentClassName: string;
  visibleModels: string[];
  onChange: (draft: ProviderDraft) => void;
  onFetchModels: () => void;
  onUseCustomModel: () => void;
}) {
  const isCustomModel = (draft.modelInputMode || 'list') === 'custom';

  return (
    <Field id="provider-model" label="模型">
      <div className="provider-model-field">
        {isCustomModel ? (
          <Input
            id="provider-model"
            name="provider-model"
            autoComplete="off"
            value={draft.modelName || ''}
            onChange={(event) => onChange({ ...draft, modelName: event.target.value })}
          />
        ) : (
          <Select
            disabled={visibleModels.length === 0}
            value={visibleModels.includes(draft.modelName || '') ? draft.modelName : ''}
            onValueChange={(modelName) => onChange({ ...draft, modelName })}
          >
            <SelectTrigger id="provider-model" aria-labelledby="provider-model-label">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent className={selectContentClassName}>
              <SelectGroup>
                {visibleModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        <Button
          className={
            isCustomModel
              ? 'action-button provider-model-mode-button is-active'
              : 'action-button provider-model-mode-button'
          }
          type="button"
          variant="secondary"
          onClick={onUseCustomModel}
        >
          <Keyboard size={15} />
          自定义
        </Button>
        <Button
          className="action-button"
          type="button"
          variant="secondary"
          disabled={modelLoading}
          onClick={onFetchModels}
        >
          <RefreshCw size={15} />
          {modelLoading ? '获取中' : '获取'}
        </Button>
      </div>
      {modelNotice ? <p className="field-inline-note">{modelNotice}</p> : null}
      {modelError ? <p className="field-inline-error">{modelError}</p> : null}
    </Field>
  );
}
