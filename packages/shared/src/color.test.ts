import { describe, expect, it } from 'vitest';
import { alphaColor, defaultUserAnnotationColor } from './color';

describe('alphaColor', () => {
  it('applies alpha to six-digit hex colors', () => {
    expect(alphaColor(' #8ab6d6 ', 0.42)).toBe('rgba(138,182,214,0.42)');
  });

  it('uses the default user annotation color for invalid input', () => {
    expect(alphaColor('transparent', 0.16)).toBe('rgba(244,201,93,0.16)');
    expect(defaultUserAnnotationColor).toBe('#f4c95d');
  });
});
