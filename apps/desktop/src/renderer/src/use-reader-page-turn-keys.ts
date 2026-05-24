import { useEffect } from 'react';

export type ReaderPageTurnDirection = 'left' | 'right';

export function useReaderPageTurnKeys({
  enabled = true,
  onTurnPage,
}: {
  enabled?: boolean;
  onTurnPage: (direction: ReaderPageTurnDirection) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      const direction = readerPageTurnDirectionFromKey(event.key);
      if (!direction) return;
      event.preventDefault();
      onTurnPage(direction);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onTurnPage]);
}

export function readerPageTurnDirectionFromKey(key: string): ReaderPageTurnDirection | null {
  if (key === 'ArrowLeft') return 'left';
  if (key === 'ArrowRight') return 'right';
  return null;
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const editable = target.closest(
    'input, textarea, select, button, [contenteditable=""], [contenteditable="true"]',
  );
  return Boolean(editable);
}
