import { Check, RefreshCw, RotateCcw } from 'lucide-react';
import type { SaveState } from '../shell/app-types';
import { useTranslation } from 'react-i18next';

export function AutoSaveStatus({
  error,
  label,
  onRetry,
  state,
}: {
  error?: string;
  label?: string;
  onRetry?: () => void;
  state: SaveState;
}) {
  const { t } = useTranslation();
  const statusLabel = label ?? t('settings.saveStatus.label');

  if (state === 'idle') return null;

  if (state === 'error') {
    return (
      <div className="auto-save-status is-error" role="alert" aria-label={statusLabel}>
        {error ? <span>{error}</span> : null}
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            <RotateCcw size={14} />
            {t('settings.saveStatus.retry')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      aria-label={statusLabel}
      className={state === 'saving' ? 'auto-save-status is-saving' : 'auto-save-status is-saved'}
      role="status"
    >
      {state === 'saving' ? <RefreshCw size={14} /> : <Check size={14} />}
      <span>
        {state === 'saving' ? t('settings.saveStatus.saving') : t('settings.saveStatus.saved')}
      </span>
    </div>
  );
}
