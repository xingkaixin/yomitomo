import type { MessageSendShortcut, SelectionActionShortcuts } from '@yomitomo/shared';
import {
  defaultMessageSendShortcut,
  defaultSelectionActionShortcuts,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
} from '@yomitomo/shared';

export type MessageSendShortcutKeyboardEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
};

export function getShortcutModifier() {
  return platformUsesMetaKey(navigatorPlatform()) ? '⌘' : 'Ctrl';
}

export function messageSendShortcutKeys(
  shortcut: MessageSendShortcut | undefined,
  modifier = getShortcutModifier(),
) {
  return normalizeMessageSendShortcut(shortcut) === 'mod-enter' ? [modifier, '⏎'] : ['⏎'];
}

export function isMessageSendShortcutEvent(
  event: MessageSendShortcutKeyboardEvent,
  shortcut: MessageSendShortcut | undefined = defaultMessageSendShortcut,
  platform = navigatorPlatform(),
) {
  if (event.nativeEvent?.isComposing || event.key !== 'Enter') return false;

  if (normalizeMessageSendShortcut(shortcut) === 'mod-enter') {
    return platformUsesMetaKey(platform) ? Boolean(event.metaKey) : Boolean(event.ctrlKey);
  }

  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

export type SelectionActionShortcut = 'annotate' | 'ask' | 'copy';

export type SelectionActionShortcutKeyboardEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
};

export function selectionActionShortcut(
  event: SelectionActionShortcutKeyboardEvent,
  shortcuts: Partial<SelectionActionShortcuts> = defaultSelectionActionShortcuts,
): SelectionActionShortcut | null {
  if (
    event.repeat ||
    event.isComposing ||
    event.nativeEvent?.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return null;
  }

  const key = event.key.toUpperCase();
  const normalizedShortcuts = normalizeSelectionActionShortcuts(shortcuts);
  if (key === normalizedShortcuts.ask) return 'ask';
  if (key === normalizedShortcuts.annotate) return 'annotate';
  if (key === normalizedShortcuts.copy) return 'copy';
  return null;
}

function navigatorPlatform() {
  return typeof navigator === 'undefined' ? '' : navigator.platform;
}

function platformUsesMetaKey(platform: string) {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}
