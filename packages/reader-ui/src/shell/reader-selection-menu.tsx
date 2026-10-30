import { HugeiconsIcon } from '@hugeicons/react';
import {
  Copy01Icon,
  MessageAdd01Icon,
  MessageQuestionIcon,
  Search01Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons';
import { useImperativeHandle, useReducer, useRef, type Ref } from 'react';
import type { SelectionActionShortcuts } from '@yomitomo/shared';
import { normalizeSelectionActionShortcuts } from '@yomitomo/shared';
import { Kbd } from '../components/ui/kbd';
import type { SelectionMenuAction } from '../reader-types';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';
import { useMountEffect } from '../hooks/use-mount-effect';

type SelectionMenuLabels = Pick<
  ReaderUiLabels,
  'askSelection' | 'copySelection' | 'recordThought' | 'findRelated'
>;

export type SelectionMenuHandle = {
  copy: () => Promise<void>;
};

type CopyState = 'idle' | 'copying' | 'copied';

type CopyEvent = { type: 'copyFailed' } | { type: 'copyStarted' } | { type: 'copySucceeded' };

function copyStateReducer(_state: CopyState, event: CopyEvent): CopyState {
  switch (event.type) {
    case 'copyFailed':
      return 'idle';
    case 'copyStarted':
      return 'copying';
    case 'copySucceeded':
      return 'copied';
  }
}

export function SelectionMenu({
  action,
  labels = defaultReaderUiLabels,
  shortcuts,
  onAnnotate,
  onAsk,
  onFindRelated,
  onCopy,
  onCopySettled,
  ref,
}: {
  action: SelectionMenuAction;
  labels?: SelectionMenuLabels;
  ref?: Ref<SelectionMenuHandle>;
  shortcuts?: Partial<SelectionActionShortcuts>;
  onAnnotate: () => void;
  onAsk?: () => void;
  onFindRelated?: () => void;
  onCopy: () => void | Promise<void>;
  onCopySettled?: () => void;
}) {
  const shortcutKeys = normalizeSelectionActionShortcuts(shortcuts);
  const [copyState, dispatch] = useReducer(copyStateReducer, 'idle');
  const closeTimerRef = useRef<number | null>(null);

  useMountEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  });

  async function copy() {
    if (copyState !== 'idle') return;
    dispatch({ type: 'copyStarted' });
    try {
      await onCopy();
      dispatch({ type: 'copySucceeded' });
      closeTimerRef.current = window.setTimeout(() => onCopySettled?.(), 520);
    } catch {
      dispatch({ type: 'copyFailed' });
    }
  }

  useImperativeHandle(ref, () => ({ copy }));

  const copied = copyState === 'copied';

  return (
    <div
      className="reader-selection-menu"
      style={{ left: action.x, top: action.y }}
      onMouseDown={(event) => event.preventDefault()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <button
        aria-live="polite"
        className={copied ? 'reader-selection-primary is-copied' : 'reader-selection-primary'}
        disabled={copyState === 'copying'}
        type="button"
        onClick={() => void copy()}
      >
        <span
          aria-hidden="true"
          className="reader-selection-copy-icon t-icon-swap"
          data-state={copied ? 'b' : 'a'}
        >
          <span className="t-icon" data-icon="a">
            <HugeiconsIcon icon={Copy01Icon} size={15} strokeWidth={2.2} />
          </span>
          <span className="t-icon" data-icon="b">
            <HugeiconsIcon icon={Tick01Icon} size={15} strokeWidth={2.4} />
          </span>
        </span>
        <span>{labels.copySelection}</span>
        <Kbd className="reader-kbd">{shortcutKeys.copy}</Kbd>
      </button>
      <button className="reader-selection-primary" type="button" onClick={onAnnotate}>
        <HugeiconsIcon icon={MessageAdd01Icon} size={15} strokeWidth={2.2} />
        {labels.recordThought}
        <Kbd className="reader-kbd">{shortcutKeys.annotate}</Kbd>
      </button>
      {onAsk ? (
        <button className="reader-selection-primary" type="button" onClick={onAsk}>
          <HugeiconsIcon icon={MessageQuestionIcon} size={15} strokeWidth={2.2} />
          {labels.askSelection}
          <Kbd className="reader-kbd">{shortcutKeys.ask}</Kbd>
        </button>
      ) : null}
      {onFindRelated ? (
        <button className="reader-selection-primary" type="button" onClick={onFindRelated}>
          <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={2.2} />
          {labels.findRelated}
        </button>
      ) : null}
    </div>
  );
}
