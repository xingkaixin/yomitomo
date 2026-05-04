import { describe, expect, it } from 'vitest';
import type { Annotation } from '@yomitomo/shared';
import type { TocItem } from './reader-dom';
import { annotationStoredColor, buildTocAnnotationStats } from './reader-annotations';

function tocItem(index: number, start: number, end: number): TocItem {
  return {
    index,
    text: `章节 ${index}`,
    depth: 2,
    start,
    end,
  };
}

function annotation(id: string, start: number, color: Partial<Annotation> = {}): Annotation {
  return {
    id,
    anchor: {
      exact: id,
      prefix: '',
      suffix: '',
      start,
      end: start + id.length,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    ...color,
  };
}

describe('reader annotation stats', () => {
  it('groups annotations by toc range and keeps unique colors in encounter order', () => {
    const stats = buildTocAnnotationStats(
      [tocItem(0, 0, 20), tocItem(1, 20, 40)],
      [
        annotation('a', 0, { color: '#111111' }),
        annotation('b', 19, { color: '#111111' }),
        annotation('c', 20, { color: '#222222' }),
        annotation('d', 39, { agentAnnotationColor: '#333333' }),
      ],
    );

    expect(stats.get(0)).toEqual({ count: 2, colors: ['#111111'] });
    expect(stats.get(1)).toEqual({ count: 2, colors: ['#222222', '#333333'] });
  });

  it('ignores unresolved anchor offsets', () => {
    const stats = buildTocAnnotationStats(
      [tocItem(0, 0, 20)],
      [annotation('a', Number.NaN), annotation('b', 8)],
    );

    expect(stats.get(0)).toEqual({ count: 1, colors: ['#f4c95d'] });
  });

  it('prefers agent and user stored colors before the base annotation color', () => {
    expect(
      annotationStoredColor(
        annotation('agent', 0, {
          agentAnnotationColor: '#8ab6d6',
          userAnnotationColor: '#f4c95d',
          color: '#111111',
        }),
      ),
    ).toBe('#8ab6d6');
    expect(annotationStoredColor(annotation('user', 0, { userAnnotationColor: '#f4c95d' }))).toBe(
      '#f4c95d',
    );
    expect(annotationStoredColor(annotation('fallback', 0, { color: '' }))).toBe('#f4c95d');
  });
});
