import { AlignLeft, GitPullRequestDraft } from 'lucide-react';
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
        <GitPullRequestDraft size={13} />
        {t('discussion.layout.split')}
      </button>
      <button
        className={value === 'left' ? 'is-active' : ''}
        type="button"
        aria-pressed={value === 'left'}
        onClick={() => onChange('left')}
      >
        <AlignLeft size={13} />
        {t('discussion.layout.left')}
      </button>
    </div>
  );
}
