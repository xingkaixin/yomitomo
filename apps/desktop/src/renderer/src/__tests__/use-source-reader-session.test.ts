import { describe, expect, it } from 'vitest';
import { createTextAnchor, type Annotation, type AgentReadingPlanItem } from '@yomitomo/shared';
import { constrainSourceAgentPlanAnnotation } from '../use-source-reader-session';

describe('constrainSourceAgentPlanAnnotation', () => {
  it('keeps annotations inside their reading plan section and applies section intent', () => {
    const articleText = '第一段内容。第二段内容。';
    const annotation = annotationFor(articleText, 6, 10, 'explain');
    const readingPlan: AgentReadingPlanItem[] = [
      {
        sectionId: 'section-1',
        sectionTitle: '第一段',
        sectionStart: 0,
        sectionEnd: 5,
      },
      {
        sectionId: 'section-2',
        sectionTitle: '第二段',
        sectionStart: 6,
        sectionEnd: articleText.length,
        readingIntent: 'challenge',
      },
    ];

    const constrained = constrainSourceAgentPlanAnnotation(annotation, readingPlan, articleText);

    expect(constrained).toMatchObject({
      id: 'annotation-1',
      readingIntent: 'challenge',
      comments: [{ id: 'comment-1', readingIntent: 'challenge' }],
    });
  });

  it('drops annotations outside the reading plan', () => {
    const articleText = '第一段内容。第二段内容。';
    const annotation = annotationFor(articleText, 6, 10);
    const readingPlan: AgentReadingPlanItem[] = [
      {
        sectionId: 'section-1',
        sectionTitle: '第一段',
        sectionStart: 0,
        sectionEnd: 5,
      },
    ];

    expect(constrainSourceAgentPlanAnnotation(annotation, readingPlan, articleText)).toBeNull();
  });
});

function annotationFor(
  articleText: string,
  start: number,
  end: number,
  readingIntent?: Annotation['readingIntent'],
): Annotation {
  return {
    id: 'annotation-1',
    anchor: createTextAnchor(articleText, start, end),
    author: 'ai',
    color: 'yellow',
    comments: [
      {
        id: 'comment-1',
        author: 'ai',
        content: 'comment',
        createdAt: '2026-05-25T00:00:00.000Z',
      },
    ],
    createdAt: '2026-05-25T00:00:00.000Z',
    readingIntent,
    updatedAt: '2026-05-25T00:00:00.000Z',
  };
}
