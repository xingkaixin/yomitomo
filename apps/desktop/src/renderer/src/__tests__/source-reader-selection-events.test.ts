import { describe, expect, it } from 'vitest';
import { isContinuousTextSelectionMouseEvent } from '../source/bookcase/source-reader-selection-events';

describe('source reader selection events', () => {
  it('recognizes left-button double and triple clicks as continuous text selection', () => {
    expect(isContinuousTextSelectionMouseEvent(mouseEvent({ button: 0, detail: 2 }))).toBe(true);
    expect(isContinuousTextSelectionMouseEvent(mouseEvent({ button: 0, detail: 3 }))).toBe(true);
  });

  it('keeps single clicks and non-left clicks out of continuous text selection', () => {
    expect(isContinuousTextSelectionMouseEvent(mouseEvent({ button: 0, detail: 1 }))).toBe(false);
    expect(isContinuousTextSelectionMouseEvent(mouseEvent({ button: 2, detail: 2 }))).toBe(false);
  });
});

function mouseEvent({ button, detail }: { button: number; detail: number }) {
  return { button, detail } as MouseEvent;
}
