import { describe, expect, it } from 'vitest';
import {
  annotationThreadSourceVersion,
  deletedAnnotationThreadSourceVersion,
} from './reading-memory-source-version';

describe('reading memory source version', () => {
  it('hashes persisted annotation data with comments ordered by id', () => {
    const version = annotationThreadSourceVersion(
      {
        id: 'annotation_1',
        articleId: 'article_1',
        anchor: { exact: 'Evidence', range: { start: 12, end: 20 } },
        updatedAt: '2026-08-29T08:00:00.000Z',
      },
      [
        {
          id: 'comment_2',
          annotationId: 'annotation_1',
          content: 'Second',
          assistantProgress: { fallbackMessage: 'Done', steps: [] },
        },
        {
          id: 'comment_1',
          annotationId: 'annotation_1',
          content: 'First',
          assistantProgress: null,
        },
      ],
    );

    expect(version).toMatch(/^[a-f0-9]{64}$/);
    expect(version).toBe(
      annotationThreadSourceVersion(
        {
          updatedAt: '2026-08-29T08:00:00.000Z',
          anchor: { range: { end: 20, start: 12 }, exact: 'Evidence' },
          articleId: 'article_1',
          id: 'annotation_1',
        },
        [
          {
            assistantProgress: null,
            content: 'First',
            annotationId: 'annotation_1',
            id: 'comment_1',
          },
          {
            assistantProgress: { steps: [], fallbackMessage: 'Done' },
            content: 'Second',
            annotationId: 'annotation_1',
            id: 'comment_2',
          },
        ],
      ),
    );
  });

  it('changes when a persisted source fact changes', () => {
    const annotation = { id: 'annotation_1', content: 'Original' };
    const comments = [{ id: 'comment_1', content: 'Reader thought' }];
    const original = annotationThreadSourceVersion(annotation, comments);

    expect(annotationThreadSourceVersion({ ...annotation, content: 'Revised' }, comments)).not.toBe(
      original,
    );
    expect(
      annotationThreadSourceVersion(annotation, [{ ...comments[0], content: 'Changed thought' }]),
    ).not.toBe(original);
  });

  it('creates deterministic deletion versions from annotation identity', () => {
    const version = deletedAnnotationThreadSourceVersion('annotation_1');

    expect(version).toBe('8c966f6c214b80b7dd648b482e5e1ac60051c33d2179f82da6443cbb46705dac');
    expect(deletedAnnotationThreadSourceVersion('annotation_1')).toBe(version);
    expect(deletedAnnotationThreadSourceVersion('annotation_2')).not.toBe(version);
    expect(annotationThreadSourceVersion({ id: 'annotation_1' }, [])).not.toBe(version);
  });
});
