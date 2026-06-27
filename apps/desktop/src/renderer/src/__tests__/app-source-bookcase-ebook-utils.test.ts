import { describe, expect, it } from 'vitest';
import { ebookSpreadLayout } from '../source/ebook/app-source-bookcase-ebook-utils';

const CONTENT_WIDTH = 860;
const SPREAD_WIDTH = CONTENT_WIDTH * 2;

describe('ebookSpreadLayout', () => {
  it('falls back to a single column when inputs are non-positive', () => {
    expect(ebookSpreadLayout({ canvasWidth: 0, contentWidth: CONTENT_WIDTH })).toEqual({
      columns: 1,
      railLayout: expect.objectContaining({ mode: 'stacked' }),
    });
    expect(ebookSpreadLayout({ canvasWidth: 1000, contentWidth: 0 })).toEqual({
      columns: 1,
      railLayout: expect.objectContaining({ mode: 'stacked' }),
    });
  });

  it('uses a single column when the canvas cannot fit even one rail beside the article', () => {
    const result = ebookSpreadLayout({
      canvasWidth: CONTENT_WIDTH + 100,
      contentWidth: CONTENT_WIDTH,
    });
    expect(result.columns).toBe(1);
  });

  it('keeps a single column with both rails when the spread width cannot fit any rail', () => {
    const canvasWidth = SPREAD_WIDTH + 100;
    const result = ebookSpreadLayout({ canvasWidth, contentWidth: CONTENT_WIDTH });
    expect(result.columns).toBe(1);
    expect(result.railLayout.mode).toBe('both');
  });

  it('enables spread with a single rail when the canvas fits the spread plus one minimum rail', () => {
    const canvasWidth = SPREAD_WIDTH + 240;
    const result = ebookSpreadLayout({ canvasWidth, contentWidth: CONTENT_WIDTH });
    expect(result.columns).toBe(2);
    expect(result.railLayout.mode).toBe('right');
  });

  it('enables spread with both rails when the canvas fits the spread plus two full rails', () => {
    const canvasWidth = SPREAD_WIDTH + 760;
    const result = ebookSpreadLayout({ canvasWidth, contentWidth: CONTENT_WIDTH });
    expect(result.columns).toBe(2);
    expect(result.railLayout.mode).toBe('both');
  });

  it('returns a rail layout whose article width matches the chosen column count', () => {
    const single = ebookSpreadLayout({
      canvasWidth: CONTENT_WIDTH + 760,
      contentWidth: CONTENT_WIDTH,
    });
    expect(single.columns).toBe(1);
    expect(single.railLayout.articleWidth).toBe(CONTENT_WIDTH);

    const spread = ebookSpreadLayout({
      canvasWidth: SPREAD_WIDTH + 760,
      contentWidth: CONTENT_WIDTH,
    });
    expect(spread.columns).toBe(2);
    expect(spread.railLayout.articleWidth).toBe(SPREAD_WIDTH);
  });
});
