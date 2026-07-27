// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mappedFoliateRangeRects } from '../source/ebook/ebook-annotation-layout';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ebook annotation layout', () => {
  it('clips paginated rects to the visible foliate viewport', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const frame = document.createElement('iframe');
    shadow.append(frame);
    mockRect(host, new DOMRect(0, 0, 700, 600));
    mockRect(frame, new DOMRect(-700, 0, 2100, 600));

    const rects = mappedFoliateRangeRects(
      fakeRange(frame, [new DOMRect(740, 100, 100, 20), new DOMRect(1480, 100, 100, 20)]),
      new DOMRect(0, 0, 1400, 600),
    );

    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ left: 40, top: 100, width: 100, height: 20 });
  });
});

function fakeRange(frame: HTMLIFrameElement, rects: DOMRect[]): Range {
  return {
    startContainer: {
      ownerDocument: {
        defaultView: {
          frameElement: frame,
        },
      },
    },
    getClientRects: () => rects,
  } as unknown as Range;
}

function mockRect(element: Element, rect: DOMRect) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
}
