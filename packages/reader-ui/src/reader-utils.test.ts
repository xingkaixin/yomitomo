import { describe, expect, it } from 'vitest';
import { isMessageSendShortcutEvent, messageSendShortcutKeys } from './reader-utils';

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
