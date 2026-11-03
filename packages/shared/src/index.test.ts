import { describe, expect, it } from 'vitest';
import { createTextAnchor, resolveTextAnchor } from './index';

describe('shared text anchors', () => {
  it('resolves repeated exact text with prefix and suffix context', () => {
    const text = 'alpha target omega. beta target gamma.';
    const anchor = createTextAnchor(text, 25, 31);

    expect(resolveTextAnchor(text, { ...anchor, start: 0, end: 6 })).toEqual({
      start: 25,
      end: 31,
    });
    expect(anchor.quoteHash).toBeTruthy();
  });

  it('resolves anchors after whitespace normalization changes', () => {
    const source = 'alpha target quote omega.';
    const start = source.indexOf('target quote');
    const anchor = createTextAnchor(source, start, start + 'target quote'.length);
    const rendered = 'alpha target\n  quote omega.';

    expect(resolveTextAnchor(rendered, { ...anchor, start: 0, end: 4 })).toEqual({
      start: rendered.indexOf('target'),
      end: rendered.indexOf(' omega'),
    });
  });
});
