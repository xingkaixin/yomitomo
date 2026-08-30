import { describe, expect, it } from 'vitest';
import type { ReadingReviewFold } from '@yomitomo/shared';
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

    expect(version).toBe('958c7b3e5382ab3b76f9e6a7838d1d84b9d9e2cad12b5e182ae71b4a83e89fb5');
    expect(deletedAnnotationThreadSourceVersion('annotation_1')).toBe(version);
    expect(deletedAnnotationThreadSourceVersion('annotation_2')).not.toBe(version);
    expect(annotationThreadSourceVersion({ id: 'annotation_1' }, [])).not.toBe(version);
  });

  it('invalidates unchanged text after a review and orders folded assets deterministically', () => {
    const source = { id: 'annotation' };
    const confirmed: ReadingReviewFold = {
      content: 'Unchanged judgment',
      authorKind: 'user',
      latestReview: { id: 'review-1', decision: 'still_agree', createdAt: '2026-08-30T00:00:00Z' },
    };
    const uncertain: ReadingReviewFold = {
      ...confirmed,
      latestReview: { ...confirmed.latestReview!, id: 'review-2', decision: 'need_evidence' },
    };
    const first = new Map([['comment', confirmed]]);
    expect(annotationThreadSourceVersion(source, [], first)).not.toBe(
      annotationThreadSourceVersion(source, []),
    );
    expect(annotationThreadSourceVersion(source, [], new Map([['comment', uncertain]]))).not.toBe(
      annotationThreadSourceVersion(source, [], first),
    );
    const entries: [string, ReadingReviewFold][] = [
      ['b', confirmed],
      ['a', uncertain],
    ];
    expect(annotationThreadSourceVersion(source, [], new Map(entries))).toBe(
      annotationThreadSourceVersion(source, [], new Map(entries.toReversed())),
    );
  });
});
