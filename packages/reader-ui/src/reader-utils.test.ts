import { describe, expect, it } from 'vitest';
import {
  isMessageSendShortcutEvent,
  messageSendShortcutKeys,
  selectionActionShortcut,
} from './reader-utils';

describe('message send shortcuts', () => {
  it('formats enter and modifier shortcuts', () => {
    expect(messageSendShortcutKeys('enter', '⌘')).toEqual(['Enter']);
    expect(messageSendShortcutKeys('mod-enter', 'Ctrl')).toEqual(['Ctrl', 'Enter']);
  });

  it('matches plain enter without modifiers', () => {
    expect(isMessageSendShortcutEvent({ key: 'Enter' }, 'enter', 'MacIntel')).toBe(true);
    expect(isMessageSendShortcutEvent({ key: 'Enter', shiftKey: true }, 'enter', 'MacIntel')).toBe(
      false,
    );
    expect(isMessageSendShortcutEvent({ key: 'Enter', metaKey: true }, 'enter', 'MacIntel')).toBe(
      false,
    );
  });

  it('matches platform modifier enter', () => {
    expect(
      isMessageSendShortcutEvent({ key: 'Enter', metaKey: true }, 'mod-enter', 'MacIntel'),
    ).toBe(true);
    expect(isMessageSendShortcutEvent({ key: 'Enter', ctrlKey: true }, 'mod-enter', 'Win32')).toBe(
      true,
    );
    expect(
      isMessageSendShortcutEvent({ key: 'Enter', ctrlKey: true }, 'mod-enter', 'MacIntel'),
    ).toBe(false);
  });
});

describe('selection action shortcuts', () => {
  it('matches copy and annotate keys', () => {
    expect(selectionActionShortcut({ key: 'c' })).toBe('copy');
    expect(selectionActionShortcut({ key: 'C' })).toBe('copy');
    expect(selectionActionShortcut({ key: 'a' })).toBe('annotate');
    expect(selectionActionShortcut({ key: 'A' })).toBe('annotate');
  });

  it('ignores modifier chords and composing input', () => {
    expect(selectionActionShortcut({ key: 'c', metaKey: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'a', ctrlKey: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'c', altKey: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'a', repeat: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'c', isComposing: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'a', nativeEvent: { isComposing: true } })).toBe(null);
  });
});
