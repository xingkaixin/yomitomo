// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { elementDialogSourceRect, sourceAwareDialogStyle } from '../app-dialog-transition';

describe('source-aware dialog transition', () => {
  it('derives origin and shift from the trigger center', () => {
    window.innerWidth = 1000;
    window.innerHeight = 800;

    const style = sourceAwareDialogStyle({ x: 700, y: 500, width: 100, height: 80 });

    expect(style['--dialog-source-origin-x']).toBe('75%');
    expect(style['--dialog-source-origin-y']).toBe('67.5%');
    expect(style['--dialog-source-shift-x']).toBe('20px');
    expect(parseFloat(style['--dialog-source-shift-y'])).toBeCloseTo(11.2);
  });

  it('falls back to centered motion without a usable source', () => {
    const style = sourceAwareDialogStyle(undefined);

    expect(style['--dialog-source-origin-x']).toBe('50%');
    expect(style['--dialog-source-origin-y']).toBe('50%');
    expect(style['--dialog-source-shift-x']).toBe('0px');
    expect(style['--dialog-source-shift-y']).toBe('0px');
  });

  it('reads the source rect from a DOM element', () => {
    const element = document.createElement('button');
    element.getBoundingClientRect = () =>
      ({
        x: 24,
        y: 36,
        width: 40,
        height: 28,
      }) as DOMRect;

    expect(elementDialogSourceRect(element)).toEqual({
      x: 24,
      y: 36,
      width: 40,
      height: 28,
    });
  });
});
