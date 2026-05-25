import { Copy, MessageSquarePlus } from 'lucide-react';
import type { SelectionActionShortcuts } from '@yomitomo/shared';
import { normalizeSelectionActionShortcuts } from '@yomitomo/shared';
import { Kbd } from '../components/ui/kbd';
import type { SelectionMenuAction } from '../reader-types';

export function SelectionMenu({
  action,
  shortcuts,
  onAnnotate,
  onCopy,
}: {
  action: SelectionMenuAction;
  shortcuts?: Partial<SelectionActionShortcuts>;
  onAnnotate: () => void;
  onCopy: () => void;
}) {
  const shortcutKeys = normalizeSelectionActionShortcuts(shortcuts);

  return (
    <div
      className="reader-selection-menu"
      style={{ left: action.x, top: action.y }}
      onMouseDown={(event) => event.preventDefault()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <button className="reader-selection-primary" type="button" onClick={onCopy}>
        <Copy size={15} strokeWidth={2.2} />
        复制
        <Kbd className="reader-kbd">{shortcutKeys.copy}</Kbd>
      </button>
      <button className="reader-selection-primary" type="button" onClick={onAnnotate}>
        <MessageSquarePlus size={15} strokeWidth={2.2} />
        记录想法
        <Kbd className="reader-kbd">{shortcutKeys.annotate}</Kbd>
      </button>
    </div>
  );
}
