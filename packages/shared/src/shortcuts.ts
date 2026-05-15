import type { MessageSendShortcut, SelectionActionShortcuts } from './types';

export const defaultMessageSendShortcut: MessageSendShortcut = 'enter';

export function normalizeMessageSendShortcut(value: unknown): MessageSendShortcut {
  return value === 'mod-enter' ? 'mod-enter' : defaultMessageSendShortcut;
}

export const defaultSelectionActionShortcuts: SelectionActionShortcuts = {
  copy: 'C',
  annotate: 'A',
};

export function normalizeSelectionActionShortcutKey(value: unknown, fallback: string) {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]$/.test(key) ? key : fallback;
}

export function normalizeSelectionActionShortcutDraft(value: unknown): SelectionActionShortcuts {
  const shortcuts =
    value && typeof value === 'object' ? (value as Partial<SelectionActionShortcuts>) : undefined;
  return {
    copy: normalizeSelectionActionShortcutKey(
      shortcuts?.copy,
      defaultSelectionActionShortcuts.copy,
    ),
    annotate: normalizeSelectionActionShortcutKey(
      shortcuts?.annotate,
      defaultSelectionActionShortcuts.annotate,
    ),
  };
}

export function selectionActionShortcutsConflict(shortcuts: SelectionActionShortcuts) {
  return shortcuts.copy === shortcuts.annotate;
}

export function normalizeSelectionActionShortcuts(value: unknown): SelectionActionShortcuts {
  const shortcuts = normalizeSelectionActionShortcutDraft(value);
  return selectionActionShortcutsConflict(shortcuts) ? defaultSelectionActionShortcuts : shortcuts;
}
