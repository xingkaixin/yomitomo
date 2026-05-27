// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  isEditableKeyboardTarget,
  readerPageTurnDirectionFromKeyboardEvent,
} from '../use-reader-page-turn-keys';

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
  it('maps plain left and right arrow keys to page turns', () => {
    expect(readerPageTurnDirectionFromKeyboardEvent(keyEvent('ArrowLeft'))).toBe('left');
    expect(readerPageTurnDirectionFromKeyboardEvent(keyEvent('ArrowRight'))).toBe('right');
    expect(readerPageTurnDirectionFromKeyboardEvent(keyEvent('PageDown'))).toBeNull();
  });

  it('ignores modified, prevented, and editable key events', () => {
    expect(
      readerPageTurnDirectionFromKeyboardEvent({
        ...keyEvent('ArrowRight'),
        metaKey: true,
      }),
    ).toBeNull();
    expect(
      readerPageTurnDirectionFromKeyboardEvent({
        ...keyEvent('ArrowRight'),
        defaultPrevented: true,
      }),
    ).toBeNull();
    expect(readerPageTurnDirectionFromKeyboardEvent(keyEvent('ArrowRight', document.body))).toBe(
      'right',
    );
    expect(
      readerPageTurnDirectionFromKeyboardEvent(
        keyEvent('ArrowRight', document.createElement('textarea')),
      ),
    ).toBeNull();
  });

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
