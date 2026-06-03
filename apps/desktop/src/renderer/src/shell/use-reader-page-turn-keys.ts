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
      const direction = readerPageTurnDirectionFromKeyboardEvent(event);
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

export function readerPageTurnDirectionFromKeyboardEvent(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'defaultPrevented' | 'key' | 'metaKey' | 'target'
  >,
) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isEditableKeyboardTarget(event.target)) return null;
  return readerPageTurnDirectionFromKey(event.key);
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!target || !('closest' in target)) return false;
  const closest = (target as { closest?: (selector: string) => Element | null }).closest;
  if (typeof closest !== 'function') return false;
  return Boolean(
    closest.call(
      target,
      'input, textarea, select, button, [contenteditable=""], [contenteditable="true"], [role="textbox"]',
    ),
  );
}
