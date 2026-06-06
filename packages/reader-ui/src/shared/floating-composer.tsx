import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { ReaderTooltip } from './reader-component-primitives';

type FloatingComposerProps = {
  accessory?: ReactNode;
  className?: string;
  mentionMenu?: ReactNode;
  prefix?: ReactNode;
  secondaryAction?: ReactNode;
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
      prefix,
      secondaryAction,
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
    const textareaClassName = ['floating-composer-textarea', textarea.className || '']
      .filter(Boolean)
      .join(' ');
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
        {prefix}
        <textarea {...textarea} ref={ref} className={textareaClassName} />
        {mentionMenu}
        <div className="floating-composer-bar">
          {accessory || <span aria-hidden="true" />}
          <div className="floating-composer-actions">
            {secondaryAction}
            {submitTooltip ? (
              <ReaderTooltip content={submitTooltip}>{button}</ReaderTooltip>
            ) : (
              button
            )}
          </div>
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
