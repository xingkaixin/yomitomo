import { Check, RefreshCw, RotateCcw } from 'lucide-react';
import type { SaveState } from './app-types';

export function AutoSaveStatus({
  error,
  label = '保存状态',
  onRetry,
  state,
}: {
  error?: string;
  label?: string;
  onRetry?: () => void;
  state: SaveState;
}) {
  if (state === 'idle') return null;

  if (state === 'error') {
    return (
      <div className="auto-save-status is-error" role="alert" aria-label={label}>
        {error ? <span>{error}</span> : null}
        <button type="button" onClick={onRetry}>
          <RotateCcw size={14} />
          重试
        </button>
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      className={state === 'saving' ? 'auto-save-status is-saving' : 'auto-save-status is-saved'}
      role="status"
    >
      {state === 'saving' ? <RefreshCw size={14} /> : <Check size={14} />}
      <span>{state === 'saving' ? '正在保存' : '已保存'}</span>
    </div>
  );
}
