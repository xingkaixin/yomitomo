import { AlignLeft, GitPullRequestDraft } from 'lucide-react';

export type AnnotationMessageLayoutMode = 'split' | 'left';

export function AnnotationLayoutControl({
  onChange,
  value,
}: {
  onChange: (value: AnnotationMessageLayoutMode) => void;
  value: AnnotationMessageLayoutMode;
}) {
  return (
    <div className="annotation-layout-control" aria-label="消息布局">
      <button
        className={value === 'split' ? 'is-active' : ''}
        type="button"
        aria-pressed={value === 'split'}
        onClick={() => onChange('split')}
      >
        <GitPullRequestDraft size={13} />
        左右
      </button>
      <button
        className={value === 'left' ? 'is-active' : ''}
        type="button"
        aria-pressed={value === 'left'}
        onClick={() => onChange('left')}
      >
        <AlignLeft size={13} />
        左齐
      </button>
    </div>
  );
}
