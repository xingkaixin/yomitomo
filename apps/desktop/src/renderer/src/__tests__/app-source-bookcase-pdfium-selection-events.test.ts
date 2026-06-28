// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  shouldSuppressPdfiumContinuousTextSelectionEvent,
  suppressPdfiumContinuousTextSelectionEvent,
} from '../source/pdfium/app-source-bookcase-pdfium-selection-events';

describe('pdfium continuous text selection events', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('stops double-clicks before embedpdf can select a word', () => {
    const { canvas, page, textTarget } = renderPdfiumPage();
    const embedpdfListener = vi.fn();
    canvas.addEventListener('dblclick', suppressPdfiumContinuousTextSelectionEvent, {
      capture: true,
    });
    page.addEventListener('dblclick', embedpdfListener);

    const event = dispatchMouseEvent(textTarget, 'dblclick', { detail: 2 });

    expect(event.defaultPrevented).toBe(true);
    expect(embedpdfListener).not.toHaveBeenCalled();
  });

  it('stops the third click before embedpdf can select a line', () => {
    const { canvas, page, textTarget } = renderPdfiumPage();
    const embedpdfListener = vi.fn();
    canvas.addEventListener('click', suppressPdfiumContinuousTextSelectionEvent, {
      capture: true,
    });
    page.addEventListener('click', embedpdfListener);

    const event = dispatchMouseEvent(textTarget, 'click', { detail: 3 });

    expect(event.defaultPrevented).toBe(true);
    expect(embedpdfListener).not.toHaveBeenCalled();
  });

  it('leaves single-clicks available for highlight hit testing', () => {
    const { canvas, page, textTarget } = renderPdfiumPage();
    const embedpdfListener = vi.fn();
    canvas.addEventListener('click', suppressPdfiumContinuousTextSelectionEvent, {
      capture: true,
    });
    page.addEventListener('click', embedpdfListener);

    const event = dispatchMouseEvent(textTarget, 'click', { detail: 1 });

    expect(event.defaultPrevented).toBe(false);
    expect(embedpdfListener).toHaveBeenCalledTimes(1);
  });

  it('does not suppress continuous clicks on interactive page targets', () => {
    const { button } = renderPdfiumPage();

    expect(
      shouldSuppressPdfiumContinuousTextSelectionEvent(
        mouseEventLike({ target: button, type: 'dblclick' }),
      ),
    ).toBe(false);
  });

  it('does not suppress continuous clicks outside PDF pages', () => {
    const outsideTarget = document.createElement('span');
    document.body.append(outsideTarget);

    expect(
      shouldSuppressPdfiumContinuousTextSelectionEvent(
        mouseEventLike({ target: outsideTarget, type: 'dblclick' }),
      ),
    ).toBe(false);
  });
});

function renderPdfiumPage() {
  const canvas = document.createElement('div');
  canvas.className = 'pdfium-spike-canvas';

  const page = document.createElement('div');
  page.dataset.pdfiumPageIndex = '0';

  const textTarget = document.createElement('span');
  textTarget.textContent = 'PDF text';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Action';

  page.append(textTarget, button);
  canvas.append(page);
  document.body.append(canvas);

  return { button, canvas, page, textTarget };
}

function dispatchMouseEvent(
  target: Element,
  type: 'click' | 'dblclick' | 'mousedown',
  options: { detail: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    detail: options.detail,
  });
  target.dispatchEvent(event);
  return event;
}

function mouseEventLike({
  target,
  type,
}: {
  target: Element;
  type: 'click' | 'dblclick' | 'mousedown';
}) {
  return {
    button: 0,
    detail: 2,
    target,
    type,
  };
}
