import { Check, Copy, MessageCircleQuestion, MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SelectionActionShortcuts } from '@yomitomo/shared';
import { normalizeSelectionActionShortcuts } from '@yomitomo/shared';
import { Kbd } from '../components/ui/kbd';
import type { SelectionMenuAction } from '../reader-types';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

export function SelectionMenu({
  action,
  labels = defaultReaderUiLabels,
  shortcuts,
  onAnnotate,
  onAsk,
  onCopy,
  onCopySettled,
  copyRequestKey = 0,
}: {
  action: SelectionMenuAction;
  labels?: ReaderUiLabels;
  shortcuts?: Partial<SelectionActionShortcuts>;
  copyRequestKey?: number;
  onAnnotate: () => void;
  onAsk?: () => void;
  onCopy: () => void | Promise<void>;
  onCopySettled?: () => void;
}) {
  const shortcutKeys = normalizeSelectionActionShortcuts(shortcuts);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');
  const closeTimerRef = useRef<number | null>(null);
  const lastCopyRequestKeyRef = useRef(copyRequestKey);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  async function copy() {
    if (copyState !== 'idle') return;
    setCopyState('copying');
    try {
      await onCopy();
      setCopyState('copied');
      closeTimerRef.current = window.setTimeout(() => onCopySettled?.(), 520);
    } catch {
      setCopyState('idle');
    }
  }

  useEffect(() => {
    if (copyRequestKey === lastCopyRequestKeyRef.current) return;
    lastCopyRequestKeyRef.current = copyRequestKey;
    void copy();
  }, [copyRequestKey]);

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
            <Copy size={15} strokeWidth={2.2} />
          </span>
          <span className="t-icon" data-icon="b">
            <Check size={15} strokeWidth={2.4} />
          </span>
        </span>
        <span>{labels.copySelection}</span>
        <Kbd className="reader-kbd">{shortcutKeys.copy}</Kbd>
      </button>
      <button className="reader-selection-primary" type="button" onClick={onAnnotate}>
        <MessageSquarePlus size={15} strokeWidth={2.2} />
        {labels.recordThought}
        <Kbd className="reader-kbd">{shortcutKeys.annotate}</Kbd>
      </button>
      {onAsk ? (
        <button className="reader-selection-primary" type="button" onClick={onAsk}>
          <MessageCircleQuestion size={15} strokeWidth={2.2} />
          {labels.askSelection}
          <Kbd className="reader-kbd">{shortcutKeys.ask}</Kbd>
        </button>
      ) : null}
    </div>
  );
}
