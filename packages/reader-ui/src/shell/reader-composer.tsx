import React, { useEffect, useRef, useState } from 'react';
import type { MessageSendShortcut, PublicAgent } from '@yomitomo/shared';
import {
  ReaderTooltip,
  ShortcutTooltipContent,
  SubmitShortcutTooltipContent,
} from '../shared/reader-component-primitives';
import type { PendingComposer } from '../reader-types';
import { isMessageSendShortcutEvent } from '../reader-shortcuts';

export function Composer({
  composer,
  messageSendShortcut,
  shortcutModifier,
  onCancel,
  onSave,
}: {
  agents: PublicAgent[];
  composer: PendingComposer;
  messageSendShortcut: MessageSendShortcut;
  shortcutModifier: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedNote = note.trim();
  const submitLabel = trimmedNote ? '发布' : '划线';

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
    <div className="reader-composer" style={{ left: composer.x, top: composer.y }}>
      <header className="reader-composer-header">
        <div className="reader-composer-title-row">
          <strong>记录想法</strong>
        </div>
      </header>
      <div className="reader-composer-editor">
        <textarea
          aria-label="想法内容"
          autoFocus
          ref={textareaRef}
          placeholder="写下你的想法，留空则只划线…"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="reader-composer-actions">
        <ReaderTooltip content={<ShortcutTooltipContent keys={['Esc']} label="取消" />}>
          <button className="reader-composer-cancel" type="button" onClick={onCancel}>
            <span>取消</span>
          </button>
        </ReaderTooltip>
        <ReaderTooltip
          content={
            <SubmitShortcutTooltipContent
              label={submitLabel}
              shortcut={messageSendShortcut}
              shortcutModifier={shortcutModifier}
            />
          }
        >
          <button type="button" onClick={save}>
            <span>{submitLabel}</span>
          </button>
        </ReaderTooltip>
      </div>
    </div>
  );
}
