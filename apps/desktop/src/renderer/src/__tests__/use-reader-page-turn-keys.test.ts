// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  isEditableKeyboardTarget,
  readerPageTurnDirectionFromKeyboardEvent,
} from '../shell/use-reader-page-turn-keys';

function keyEvent(key: string, target: EventTarget | null = document.body) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key,
    metaKey: false,
    target,
  };
}

describe('reader page turn keys', () => {
  it('detects editable targets by closest() instead of same-window Element identity', () => {
    const crossDocumentLikeTarget = {
      closest: (selector: string) => (selector.includes('button') ? {} : null),
    } as unknown as EventTarget;

    expect(isEditableKeyboardTarget(crossDocumentLikeTarget)).toBe(true);
    expect(
      readerPageTurnDirectionFromKeyboardEvent(keyEvent('ArrowRight', crossDocumentLikeTarget)),
    ).toBeNull();
  });
});
