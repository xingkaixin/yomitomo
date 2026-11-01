import { describe, expect, it } from 'vitest';
import { railCardJump } from './annotation-rail-motion';

describe('railCardJump', () => {
  it.each([
    ['following the anchor while scrolling', { anchorTop: 300, top: 300 }, 0],
    ['holding at the rail edge while the anchor scrolls away', { anchorTop: 300, top: 400 }, 0],
    ['moving only part of the scroll distance', { anchorTop: 300, top: 350 }, 0],
    ['merging up into a stack while scrolling', { anchorTop: 300, top: 100 }, -200],
    ['being released down past the anchor', { anchorTop: 300, top: 460 }, 60],
  ])('%s', (_name, next, jump) => {
    expect(railCardJump({ anchorTop: 400, top: 400 }, next)).toBe(jump);
  });

  it('treats any move as a jump when the anchor stays put', () => {
    expect(railCardJump({ anchorTop: 200, top: 190 }, { anchorTop: 200, top: 320 })).toBe(130);
  });
});
