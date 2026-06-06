import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MessageSendShortcut, PublicAgent } from '@yomitomo/shared';
import {
  ReaderTooltip,
  ShortcutTooltipContent,
  SubmitShortcutTooltipContent,
} from '../shared/reader-component-primitives';
import { FloatingComposer } from '../shared/floating-composer';
import type { PendingComposer } from '../reader-types';
import { isMessageSendShortcutEvent } from '../reader-shortcuts';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

const COMPOSER_GAP = 10;
const COMPOSER_VIEWPORT_PADDING = 12;
const COMPOSER_FALLBACK_WIDTH = 520;
const COMPOSER_FALLBACK_HEIGHT = 232;
const COMPOSER_MAX_TEXTAREA_ROWS = 8;

type ComposerPlacement = 'below' | 'above';

type ComposerPosition = {
  left: number;
  top: number;
  placement: ComposerPlacement;
};

export function Composer({
  composer,
  labels = defaultReaderUiLabels,
  messageSendShortcut,
  shortcutModifier,
  onCancel,
  onSave,
}: {
  agents: PublicAgent[];
  composer: PendingComposer;
  labels?: ReaderUiLabels;
  messageSendShortcut: MessageSendShortcut;
  shortcutModifier: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const [position, setPosition] = useState<ComposerPosition>(() => ({
    left: composer.x,
    top: composer.y + COMPOSER_GAP,
    placement: 'below',
  }));
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedNote = note.trim();
  const submitLabel = trimmedNote ? labels.submitThought : labels.submitHighlight;

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [note]);

  useLayoutEffect(() => {
    setPosition(measureComposerPosition(composer, rootRef.current));
  }, [composer, note]);

  useEffect(() => {
    function handleCancelShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }

    window.addEventListener('keydown', handleCancelShortcut);
    return () => window.removeEventListener('keydown', handleCancelShortcut);
  }, [onCancel]);

  function save() {
    onSave(note);
  }

  function handleNoteChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.currentTarget.value);
    resizeTextarea(event.currentTarget);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

    if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
      event.preventDefault();
      save();
    }
  }

  return (
    <div
      className="reader-composer"
      data-placement={position.placement}
      ref={rootRef}
      style={{ left: position.left, top: position.top }}
    >
      <header className="reader-composer-header">
        <div className="reader-composer-title-row">
          <strong>{labels.recordThought}</strong>
        </div>
      </header>
      <FloatingComposer
        ref={textareaRef}
        className="reader-composer-editor"
        secondaryAction={
          <ReaderTooltip content={<ShortcutTooltipContent keys={['Esc']} label={labels.cancel} />}>
            <button className="reader-composer-cancel" type="button" onClick={onCancel}>
              <span>{labels.cancel}</span>
            </button>
          </ReaderTooltip>
        }
        submitLabel={submitLabel}
        submitTooltip={
          <SubmitShortcutTooltipContent
            label={submitLabel}
            shortcut={messageSendShortcut}
            shortcutModifier={shortcutModifier}
          />
        }
        textarea={{
          'aria-label': labels.thoughtContent,
          autoFocus: true,
          placeholder: labels.thoughtPlaceholder,
          rows: 3,
          value: note,
          onChange: handleNoteChange,
          onKeyDown: handleKeyDown,
        }}
        onSubmit={save}
      />
    </div>
  );
}

export function measureComposerPosition(
  composer: PendingComposer,
  element: HTMLElement | null,
): ComposerPosition {
  const canvas = element?.parentElement;
  const surface = element?.closest<HTMLElement>('.reader-surface');
  const width = element?.offsetWidth || COMPOSER_FALLBACK_WIDTH;
  const height = element?.offsetHeight || COMPOSER_FALLBACK_HEIGHT;
  const canvasWidth = canvas?.clientWidth || width;
  const viewportTop = surface && canvas ? surface.scrollTop - canvas.offsetTop : 0;
  const viewportHeight = surface?.clientHeight || window.innerHeight || height;
  const viewportBottom = viewportTop + viewportHeight;
  const minTop = viewportTop + COMPOSER_VIEWPORT_PADDING;
  const maxTop = viewportBottom - height - COMPOSER_VIEWPORT_PADDING;
  const belowTop = composer.y + COMPOSER_GAP;
  const aboveTop = composer.y - height - COMPOSER_GAP;
  const placement =
    belowTop + height + COMPOSER_VIEWPORT_PADDING > viewportBottom && aboveTop >= minTop
      ? 'above'
      : 'below';
  const preferredTop = placement === 'above' ? aboveTop : belowTop;
  const top = clamp(preferredTop, minTop, Math.max(minTop, maxTop));
  const left = clamp(
    composer.x,
    COMPOSER_VIEWPORT_PADDING,
    Math.max(COMPOSER_VIEWPORT_PADDING, canvasWidth - width - COMPOSER_VIEWPORT_PADDING),
  );

  return { left, top, placement };
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const minHeight = Number.parseFloat(styles.minHeight) || lineHeight * 3 + verticalPadding;
  const maxHeight = Math.round(lineHeight * COMPOSER_MAX_TEXTAREA_ROWS + verticalPadding);

  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
