import {
  AlertCircleIcon,
  ArrowRight01Icon,
  Download04Icon,
  PartyIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';

import type { AppUpdateState } from '../../../app-update-types';

type CardStatus = Extract<
  AppUpdateState['status'],
  'available' | 'downloading' | 'download-error' | 'downloaded'
>;

const statusIcons = {
  available: PartyIcon,
  downloading: Download04Icon,
  downloaded: Tick02Icon,
  'download-error': AlertCircleIcon,
} as const satisfies Record<CardStatus, unknown>;

const statusLabelKeys = {
  available: 'nav.updateAvailable',
  downloading: 'nav.updateDownloading',
  downloaded: 'nav.updateReady',
  'download-error': 'nav.updateFailed',
} as const satisfies Record<CardStatus, string>;

export function AppUpdateCard({
  state,
  onClick,
}: {
  state: AppUpdateState | null;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (!state || !isCardStatus(state.status)) return null;

  const status = state.status;
  const percent = status === 'downloading' ? normalizedPercent(state.progress?.percent) : 0;

  return (
    <button type="button" className="app-update-card" data-status={status} onClick={onClick}>
      <span className="app-update-card-status">
        <HugeiconsIcon icon={statusIcons[status]} aria-hidden="true" size={13} />
        <span>{t(statusLabelKeys[status])}</span>
        {status === 'downloading' ? (
          <span className="app-update-card-percent">{percent}%</span>
        ) : null}
      </span>
      <span className="app-update-card-version">
        <span>Yomitomo {state.availableVersion}</span>
        <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" size={14} />
      </span>
      {status === 'downloading' ? (
        <span aria-hidden="true" className="app-update-card-progress">
          <span style={{ width: `${percent}%` }} />
        </span>
      ) : null}
    </button>
  );
}

function isCardStatus(status: AppUpdateState['status']): status is CardStatus {
  return status in statusIcons;
}

function normalizedPercent(percent: number | undefined) {
  if (!Number.isFinite(percent)) return 0;
  return Math.round(Math.min(100, Math.max(0, percent ?? 0)));
}
