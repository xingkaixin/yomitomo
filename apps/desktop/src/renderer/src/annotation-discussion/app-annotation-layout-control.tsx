import { HugeiconsIcon } from '@hugeicons/react';
import { GitPullRequestDraftIcon, TextAlignLeftIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';

export type AnnotationMessageLayoutMode = 'split' | 'left';

export function AnnotationLayoutControl({
  onChange,
  value,
}: {
  onChange: (value: AnnotationMessageLayoutMode) => void;
  value: AnnotationMessageLayoutMode;
}) {
  const { t } = useTranslation();
  return (
    <div className="annotation-layout-control" aria-label={t('discussion.layout.label')}>
      <button
        className={value === 'split' ? 'is-active' : ''}
        type="button"
        aria-pressed={value === 'split'}
        onClick={() => onChange('split')}
      >
        <HugeiconsIcon icon={GitPullRequestDraftIcon} size={13} />
        {t('discussion.layout.split')}
      </button>
      <button
        className={value === 'left' ? 'is-active' : ''}
        type="button"
        aria-pressed={value === 'left'}
        onClick={() => onChange('left')}
      >
        <HugeiconsIcon icon={TextAlignLeftIcon} size={13} />
        {t('discussion.layout.left')}
      </button>
    </div>
  );
}
