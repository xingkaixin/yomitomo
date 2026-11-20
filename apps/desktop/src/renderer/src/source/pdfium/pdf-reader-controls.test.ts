import { describe, expect, it } from 'vitest';
import {
  computePdfFitPageZoom,
  computePdfFitWidthZoom,
  stepPdfZoom,
} from './pdfium-annotation-layout';
import { pdfZoomActionFromKeyboardEvent } from './pdf-reader-controls';

describe('PDF zoom calculations', () => {
  it('computes fit-width zoom with horizontal padding and bounds clamping', () => {
    expect(computePdfFitWidthZoom({ viewportWidth: 848, baseWidth: 800 })).toBe(1);
    expect(computePdfFitWidthZoom({ viewportWidth: 1248, baseWidth: 600 })).toBe(2);
    expect(computePdfFitWidthZoom({ viewportWidth: 3000, baseWidth: 600 })).toBe(2);
    expect(computePdfFitWidthZoom({ viewportWidth: 248, baseWidth: 800 })).toBe(0.5);
    expect(computePdfFitWidthZoom({ viewportWidth: 0, baseWidth: 800 })).toBeNull();
  });

  it('computes fit-page zoom constrained by the tighter viewport dimension', () => {
    expect(
      computePdfFitPageZoom({
        viewportWidth: 1048,
        viewportHeight: 832,
        baseWidth: 500,
        baseHeight: 800,
      }),
    ).toBe(1);
    expect(
      computePdfFitPageZoom({
        viewportWidth: 648,
        viewportHeight: 1232,
        baseWidth: 600,
        baseHeight: 800,
      }),
    ).toBe(1);
    expect(
      computePdfFitPageZoom({
        viewportWidth: 1000,
        viewportHeight: 0,
        baseWidth: 600,
        baseHeight: 800,
      }),
    ).toBeNull();
  });

  it('steps PDF zoom in and out within [0.5, 2.0]', () => {
    expect(stepPdfZoom(1, 'in')).toBe(1.1);
    expect(stepPdfZoom(1, 'out')).toBe(0.9);
    expect(stepPdfZoom(2, 'in')).toBe(2);
    expect(stepPdfZoom(0.5, 'out')).toBe(0.5);
  });
});

describe('pdfZoomActionFromKeyboardEvent', () => {
  it('maps Cmd/Ctrl +, -, 0 to PDF zoom actions and ignores editable targets', () => {
    const base = {
      altKey: false,
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: true,
      target: null,
    };
    expect(pdfZoomActionFromKeyboardEvent({ ...base, key: '=' })).toBe('in');
    expect(pdfZoomActionFromKeyboardEvent({ ...base, key: '+' })).toBe('in');
    expect(pdfZoomActionFromKeyboardEvent({ ...base, key: '-' })).toBe('out');
    expect(pdfZoomActionFromKeyboardEvent({ ...base, key: '0' })).toBe('reset');
    expect(
      pdfZoomActionFromKeyboardEvent({ ...base, metaKey: false, ctrlKey: true, key: '-' }),
    ).toBe('out');
    expect(pdfZoomActionFromKeyboardEvent({ ...base, metaKey: false, key: '=' })).toBeNull();
    expect(pdfZoomActionFromKeyboardEvent({ ...base, altKey: true, key: '=' })).toBeNull();

    const editableTarget = {
      closest: (selector: string) => (selector.includes('input') ? {} : null),
    } as unknown as EventTarget;
    expect(
      pdfZoomActionFromKeyboardEvent({ ...base, key: '=', target: editableTarget }),
    ).toBeNull();
  });
});
