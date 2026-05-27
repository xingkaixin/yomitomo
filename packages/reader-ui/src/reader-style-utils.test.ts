import { describe, expect, it } from 'vitest';
import { noteStyle } from './reader-style-utils';

describe('noteStyle', () => {
  it('uses author color for the outline while keeping neutral shadow as the main lift', () => {
    expect(noteStyle('#54cda0', false)).toEqual({
      borderColor: 'rgba(84,205,160,0.42)',
      boxShadow: '0 4px 24px rgba(40,35,29,.12), 0 8px 24px rgba(84,205,160,0.07)',
    });
  });

  it('strengthens the author color in active state without a left rail style', () => {
    expect(noteStyle('#54cda0', true)).toEqual({
      borderColor: 'rgba(84,205,160,0.78)',
      boxShadow:
        '0 0 0 3px rgba(84,205,160,0.16), 0 4px 24px rgba(40,35,29,.15), 0 8px 26px rgba(84,205,160,0.1)',
    });
  });
});
