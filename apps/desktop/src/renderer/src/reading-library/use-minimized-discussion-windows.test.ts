import { describe, expect, it } from 'vitest';
import type { AnnotationDiscussionWindowState } from '../../../ipc-contract';
import { applyDiscussionWindowEvent } from './use-minimized-discussion-windows';

describe('applyDiscussionWindowEvent', () => {
  it('adds, replaces, restores, and removes windows by article and annotation identity', () => {
    const first = discussionWindow('article_1', 'annotation_1', true);
    const other = discussionWindow('article_2', 'annotation_1', true);
    let windows = applyDiscussionWindowEvent([], { type: 'upsert', window: first });
    windows = applyDiscussionWindowEvent(windows, { type: 'upsert', window: other });

    expect(windows).toEqual([first, other]);

    windows = applyDiscussionWindowEvent(windows, {
      type: 'upsert',
      window: { ...first, minimized: false },
    });
    expect(windows).toEqual([other]);

    windows = applyDiscussionWindowEvent(windows, {
      type: 'remove',
      articleId: other.articleId,
      annotationId: other.annotationId,
      windowId: other.windowId,
    });
    expect(windows).toEqual([]);
  });
});

function discussionWindow(
  articleId: string,
  annotationId: string,
  minimized: boolean,
): AnnotationDiscussionWindowState {
  return {
    articleId,
    annotationId,
    windowId: articleId === 'article_1' ? 1 : 2,
    minimized,
  };
}
