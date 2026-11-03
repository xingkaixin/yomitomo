import { describe, expect, it } from 'vitest';
import { annotationThreadSourceVersion } from './reading-memory-source-version';

describe('reading memory source version', () => {
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
});
