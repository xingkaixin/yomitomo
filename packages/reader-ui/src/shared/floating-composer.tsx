import {
  forwardRef,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import type { PublicAgent } from '@yomitomo/shared';
import { mentionChipSegments } from '../reader-mention-utils';
import { ReaderTooltip } from './reader-component-primitives';

type FloatingComposerProps = {
  accessory?: ReactNode;
  className?: string;
  mentionAgents?: PublicAgent[];
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
      mentionAgents = [],
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
    const [textareaScroll, setTextareaScroll] = useState({ left: 0, top: 0 });
    const textareaValue =
      typeof textarea.value === 'string'
        ? textarea.value
        : typeof textarea.value === 'number'
          ? String(textarea.value)
          : '';
    const mentionSegments = useMemo(
      () => (textareaValue ? mentionChipSegments(textareaValue, mentionAgents) : []),
      [mentionAgents, textareaValue],
    );
    const showMentionOverlay = mentionSegments.some((segment) => segment.type === 'agent');
    const rootClassName = [
      'floating-composer',
      showMentionOverlay ? 'has-mention-overlay' : '',
      className || '',
    ]
      .filter(Boolean)
      .join(' ');
    const textareaClassName = ['floating-composer-textarea', textarea.className || '']
      .filter(Boolean)
      .join(' ');
    const overlayStyle = {
      '--floating-composer-scroll-x': `${-textareaScroll.left}px`,
      '--floating-composer-scroll-y': `${-textareaScroll.top}px`,
    } as CSSProperties;
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
        <div className="floating-composer-textarea-shell">
          {showMentionOverlay ? (
            <div className="floating-composer-mention-overlay" aria-hidden="true">
              <div className="floating-composer-mention-overlay-inner" style={overlayStyle}>
                {mentionSegments.map((segment, index) =>
                  segment.type === 'text' ? (
                    <span key={index}>{segment.text}</span>
                  ) : (
                    <span
                      className="floating-composer-mention-chip"
                      key={index}
                      style={mentionChipStyle(segment.agent.annotationColor)}
                    >
                      {segment.text}
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : null}
          <textarea
            {...textarea}
            ref={ref}
            className={textareaClassName}
            onScroll={(event) => {
              if (showMentionOverlay) {
                setTextareaScroll({
                  left: event.currentTarget.scrollLeft,
                  top: event.currentTarget.scrollTop,
                });
              }
              textarea.onScroll?.(event);
            }}
          />
        </div>
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

function mentionChipStyle(value: string) {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/iu.test(value)
    ? ({ '--mention-accent': value } as CSSProperties)
    : undefined;
}
