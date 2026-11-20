import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { readingMemoryActiveProgress, useReadingMemoryStatus } from './use-reading-memory-status';
import './reading-memory-progress-banner.css';

export function ReadingMemoryProgressBanner({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const { data: snapshot } = useReadingMemoryStatus();
  const progress = readingMemoryActiveProgress(snapshot);
  if (!progress) return null;

  const formatMb = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: 1,
    }).format(value / 1_000_000);

  const label =
    progress.kind === 'downloading'
      ? t('readingMemory.progress.downloadingModel', {
          downloaded: formatMb(progress.downloadedBytes),
          total: formatMb(progress.totalBytes),
          percent: progress.percent,
        })
      : progress.kind === 'semantic'
        ? t('readingMemory.progress.buildingSemantic', {
            count: progress.indexed,
            total: progress.total,
            percent: progress.percent,
          })
        : t('readingMemory.progress.buildingProjection', {
            count: progress.projected,
            total: progress.total,
            percent: progress.percent,
          });

  return (
    <div
      className={['reading-memory-progress-banner', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
    >
      <div className="reading-memory-progress-banner-copy">
        <HugeiconsIcon
          className="reading-memory-progress-banner-spinner"
          icon={Loading03Icon}
          size={14}
        />
        <span>{label}</span>
      </div>
      <progress aria-label={label} max={100} value={progress.percent} />
    </div>
  );
}
