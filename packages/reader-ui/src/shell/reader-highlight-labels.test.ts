import { describe, expect, it } from 'vitest';
import { annotationOrdinalsById, highlightDiscussionLabel } from './reader-highlight-labels';

describe('annotationOrdinalsById', () => {
  it('numbers annotations in their current order, starting at one', () => {
    const ordinals = annotationOrdinalsById([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    expect([...ordinals]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('keeps the first position for a duplicate id', () => {
    const ordinals = annotationOrdinalsById([{ id: 'a' }, { id: 'b' }, { id: 'a' }]);

    expect(ordinals.get('a')).toBe(1);
  });

  it('renumbers after a reorder', () => {
    const ordinals = annotationOrdinalsById([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);

    expect(ordinals.get('a')).toBe(2);
    expect(ordinals.get('c')).toBe(1);
  });
});

describe('highlightDiscussionLabel', () => {
  it('labels every segment of one annotation with the same ordinal', () => {
    const ordinals = annotationOrdinalsById([{ id: 'a' }, { id: 'b' }]);

    expect(highlightDiscussionLabel(ordinals.get('b'))).toBe('打开引文讨论 2');
    expect(highlightDiscussionLabel(ordinals.get('b'))).toBe('打开引文讨论 2');
  });

  it('falls back to the plain label for an unknown annotation', () => {
    expect(highlightDiscussionLabel(annotationOrdinalsById([]).get('missing'))).toBe(
      '打开引文讨论',
    );
  });
});
