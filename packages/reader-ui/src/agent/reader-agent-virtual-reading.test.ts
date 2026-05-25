import { describe, expect, it } from 'vitest';
import {
  nextReadingOffset,
  normalizedReadingSections,
  type VirtualReadingProgress,
} from './reader-agent-virtual-reading';

function progress(session: Partial<VirtualReadingProgress>): VirtualReadingProgress {
  return {
    offset: 0,
    step: 1,
    sections: [],
    sectionIndex: 0,
    ...session,
  };
}

describe('reader agent virtual reading', () => {
  it('normalizes valid reading sections by document order', () => {
    expect(
      normalizedReadingSections([
        {
          sectionId: 'late',
          sectionTitle: 'Late',
          sectionStart: 20,
          sectionEnd: 30,
        },
        {
          sectionId: 'negative',
          sectionTitle: 'Negative',
          sectionStart: -5,
          sectionEnd: 5,
        },
        {
          sectionId: 'empty',
          sectionTitle: 'Empty',
          sectionStart: 8,
          sectionEnd: 8,
        },
      ]),
    ).toEqual([
      { start: 0, end: 5 },
      { start: 20, end: 30 },
    ]);
  });

  it('advances through multiple sections', () => {
    expect(
      nextReadingOffset(
        progress({
          offset: 5,
          step: 2,
          sections: [
            { start: 0, end: 10 },
            { start: 20, end: 30 },
          ],
        }),
        100,
      ),
    ).toEqual({ offset: 7, sectionIndex: 0 });
  });

  it('wraps to the next section when the current section ends', () => {
    expect(
      nextReadingOffset(
        progress({
          offset: 8,
          step: 2,
          sections: [
            { start: 0, end: 10 },
            { start: 20, end: 30 },
          ],
        }),
        100,
      ),
    ).toEqual({ offset: 20, sectionIndex: 1 });
  });

  it('wraps from the last section back to the first section', () => {
    expect(
      nextReadingOffset(
        progress({
          offset: 11,
          step: 1,
          sectionIndex: 1,
          sections: [
            { start: 0, end: 3 },
            { start: 10, end: 12 },
          ],
        }),
        100,
      ),
    ).toEqual({ offset: 0, sectionIndex: 0 });
  });

  it('keeps empty-section progress linear', () => {
    expect(nextReadingOffset(progress({ offset: 4, step: 3, sectionIndex: 7 }), 100)).toEqual({
      offset: 7,
      sectionIndex: 7,
    });
  });
});
