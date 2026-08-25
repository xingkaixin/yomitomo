import { PartyIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppUpdateState } from '../../../app-update-types';

export function AppUpdateNavButton({
  state,
  onClick,
}: {
  state: AppUpdateState | null;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (!state || !canOpenUpdate(state.status)) return null;

  const downloading = state.status === 'downloading';
  const percent = downloading ? normalizedPercent(state.progress?.percent) : 0;
  const label = downloading ? t('nav.updateDownloading', { percent }) : t('nav.updateAvailable');
  const tooltip = downloading
    ? t('nav.updateDownloadingTooltip', { percent })
    : t('nav.updateAvailableTooltip');

  return (
    <button
      type="button"
      className="app-nav-update-button"
      aria-label={tooltip}
      data-downloading={downloading ? 'true' : undefined}
      data-tooltip={tooltip}
      style={{ '--app-nav-update-progress': percent / 100 } as CSSProperties}
      onClick={onClick}
    >
      <span className="app-nav-update-button-content">
        {downloading ? null : <HugeiconsIcon icon={PartyIcon} aria-hidden="true" size={13} />}
        {label}
      </span>
    </button>
  );
}

function canOpenUpdate(status: AppUpdateState['status']) {
  return (
    status === 'available' ||
    status === 'downloading' ||
    status === 'download-error' ||
    status === 'downloaded'
  );
}

function normalizedPercent(percent: number | undefined) {
  if (!Number.isFinite(percent)) return 0;
  return Math.round(Math.min(100, Math.max(0, percent ?? 0)));
}
