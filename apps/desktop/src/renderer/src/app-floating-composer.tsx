import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';

type FloatingComposerProps = {
  accessory?: ReactNode;
  className?: string;
  mentionMenu?: ReactNode;
  status?: ReactNode;
  submitDisabled?: boolean;
  submitIcon?: ReactNode;
  submitLabel: string;
  submitTooltip?: ReactNode;
  textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;
  onSubmit: () => void;
};

export const FloatingComposer = forwardRef<HTMLTextAreaElement, FloatingComposerProps>(
  function FloatingComposer(
    {
      accessory,
      className,
      mentionMenu,
      status,
      submitDisabled,
      submitIcon,
      submitLabel,
      submitTooltip,
      textarea,
      onSubmit,
    },
    ref,
  ) {
    const rootClassName = ['floating-composer', className || ''].filter(Boolean).join(' ');
    const button = (
      <button
        className="floating-composer-submit"
        type="button"
        disabled={submitDisabled}
        aria-label={submitLabel}
        onClick={onSubmit}
      >
        {submitIcon}
        <span>{submitLabel}</span>
      </button>
    );

    return (
      <div className={rootClassName}>
        <textarea {...textarea} ref={ref} className="floating-composer-textarea" />
        {mentionMenu}
        <div className="floating-composer-bar">
          {accessory || <span aria-hidden="true" />}
          {submitTooltip ? <ReaderTooltip content={submitTooltip}>{button}</ReaderTooltip> : button}
        </div>
        {status ? (
          <div className="floating-composer-status" aria-live="polite">
            {status}
          </div>
        ) : null}
      </div>
    );
  },
);
