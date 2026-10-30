import React, { useCallback, useEffectEvent, useReducer, useRef } from 'react';
import type { MessageSendShortcut, PublicAgent } from '@yomitomo/shared';
import {
  ReaderTooltip,
  ShortcutTooltipContent,
  SubmitShortcutTooltipContent,
} from '../shared/reader-component-primitives';
import { FloatingComposer } from '../shared/floating-composer';
import type { PendingComposer } from '../reader-types';
import { useCompositionSubmit } from '../use-composition-submit';
import { useEventListener } from '../hooks/use-event-listener';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

const COMPOSER_GAP = 10;
const COMPOSER_VIEWPORT_PADDING = 12;
const COMPOSER_FALLBACK_WIDTH = 520;
const COMPOSER_FALLBACK_HEIGHT = 232;
const COMPOSER_MAX_TEXTAREA_ROWS = 8;
const COMPOSER_CLOSE_FALLBACK_MS = 120;

type ComposerPlacement = 'below' | 'above';
export type ComposerPopupPhase = 'opening' | 'open' | 'closing';

type ComposerLabels = Pick<
  ReaderUiLabels,
  | 'cancel'
  | 'recordThought'
  | 'submitHighlight'
  | 'submitThought'
  | 'thoughtContent'
  | 'thoughtPlaceholder'
>;

type ComposerPosition = {
  left: number;
  top: number;
  placement: ComposerPlacement;
};

type ComposerState = { note: string; position: ComposerPosition };

type ComposerEvent =
  | { type: 'noteEdited'; note: string; position: ComposerPosition | null }
  | { type: 'positioned'; position: ComposerPosition };

function composerReducer(state: ComposerState, event: ComposerEvent): ComposerState {
  switch (event.type) {
    case 'noteEdited':
      return {
        note: event.note,
        position: event.position
          ? keepSamePosition(state.position, event.position)
          : state.position,
      };
    case 'positioned': {
      const position = keepSamePosition(state.position, event.position);
      return position === state.position ? state : { ...state, position };
    }
  }
}

function keepSamePosition(current: ComposerPosition, next: ComposerPosition) {
  return current.left === next.left &&
    current.top === next.top &&
    current.placement === next.placement
    ? current
    : next;
}

export function Composer({
  composer,
  labels = defaultReaderUiLabels,
  messageSendShortcut,
  phase = 'open',
  shortcutModifier,
  onCancel,
  onClosed,
  onOpened,
  onSave,
}: {
  agents: PublicAgent[];
  composer: PendingComposer;
  labels?: ComposerLabels;
  messageSendShortcut: MessageSendShortcut;
  phase?: ComposerPopupPhase;
  shortcutModifier: string;
  onCancel: () => void;
  onClosed?: () => void;
  onOpened?: () => void;
  onSave: (note: string) => void | Promise<void>;
}) {
  const [{ note, position }, dispatch] = useReducer(
    composerReducer,
    composer,
    (pending): ComposerState => ({
      note: '',
      position: { left: pending.x, top: pending.y + COMPOSER_GAP, placement: 'below' },
    }),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trimmedNote = note.trim();
  const submitLabel = trimmedNote ? labels.submitThought : labels.submitHighlight;
  const interactive = phase !== 'closing';
  const className = [
    'reader-composer',
    't-dropdown',
    phase === 'open' ? 'is-open' : '',
    phase === 'closing' ? 'is-closing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const reportOpened = useEffectEvent(() => onOpened?.());
  const reportClosed = useEffectEvent(() => onClosed?.());

  // Recreated when the composer or its phase changes, so placement and motion timing follow that commit.
  const attachRoot = useCallback(
    (root: HTMLDivElement) => {
      rootRef.current = root;
      dispatch({ type: 'positioned', position: measureComposerPosition(composer, root) });

      const frame = phase === 'opening' ? window.requestAnimationFrame(() => reportOpened()) : 0;
      const timer =
        phase === 'closing' ? window.setTimeout(() => reportClosed(), composerCloseMs(root)) : 0;
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    },
    [composer, phase],
  );

  useEventListener(interactive ? window : null, 'keydown', (event) => {
    if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  });

  function save() {
    if (!interactive) return;
    void onSave(note);
  }

  const handleKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onCancel: interactive ? onCancel : undefined,
    onSubmit: save,
  });

  function handleNoteChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    resizeTextarea(event.currentTarget);
    dispatch({
      type: 'noteEdited',
      note: event.currentTarget.value,
      position: rootRef.current ? measureComposerPosition(composer, rootRef.current) : null,
    });
  }

  return (
    <div
      className={className}
      data-placement={position.placement}
      data-side={position.placement === 'above' ? 'top' : 'bottom'}
      data-state={phase}
      aria-hidden={phase === 'closing'}
      inert={phase === 'closing' ? true : undefined}
      ref={attachRoot}
      style={{ left: position.left, top: position.top }}
    >
      <header className="reader-composer-header">
        <div className="reader-composer-title-row">
          <strong>{labels.recordThought}</strong>
        </div>
      </header>
      <FloatingComposer
        ref={resizeTextarea}
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

function composerCloseMs(root: HTMLElement) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
  const element = root.closest<HTMLElement>('.reader-app') || document.documentElement;
  const raw = window.getComputedStyle(element).getPropertyValue('--dropdown-close-dur').trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return COMPOSER_CLOSE_FALLBACK_MS;
  return raw.endsWith('ms') ? value : value * 1000;
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
