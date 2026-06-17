import { useCallback } from 'react';
import type React from 'react';
import type { MessageSendShortcut } from '@yomitomo/shared';
import { isMessageSendShortcutEvent } from './reader-shortcuts';

type UseCompositionSubmitOptions = {
  messageSendShortcut: MessageSendShortcut;
  onSubmit: () => void;
  onCancel?: () => void;
};

export function useCompositionSubmit({
  messageSendShortcut,
  onSubmit,
  onCancel,
}: UseCompositionSubmitOptions) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (onCancel && event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
        event.preventDefault();
        onSubmit();
      }
    },
    [messageSendShortcut, onCancel, onSubmit],
  );
}
