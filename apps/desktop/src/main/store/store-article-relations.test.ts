import { describe, expect, it } from 'vitest';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  type Annotation,
  type Comment,
} from '@yomitomo/shared';
import { buildArticleChildRows } from '../articles/article-repository-child-rows';
import { rowToAnnotation } from './store-normalizers';

describe('desktop store article relations', () => {
  it('preserves PDF annotation anchors when reading rows', () => {
    const pdfAnchor = createPdfTextAnchor({
      pageText: '第一页 PDF 正文',
      pageIndex: 2,
      start: 4,
      end: 7,
      pageWidth: 612,
      pageHeight: 792,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });
    const rows = buildArticleChildRows({
      id: 'pdf-article',
      annotations: [{ ...annotationRecord('pdf-annotation', []), anchor: pdfAnchor }],
    });

    const annotationRow = rows.annotationRows[0];
    if (!annotationRow) throw new Error('expected annotation row');
    const annotation = rowToAnnotation(
      {
        ...annotationRow,
        annotationType: annotationRow.annotationType ?? null,
        readingIntent: annotationRow.readingIntent ?? null,
        whyHere: annotationRow.whyHere ?? null,
        confidence: annotationRow.confidence ?? null,
        moveType: annotationRow.moveType ?? null,
        shouldShow: annotationRow.shouldShow ?? null,
        agentId: annotationRow.agentId ?? null,
        agentUsername: annotationRow.agentUsername ?? null,
        agentNickname: annotationRow.agentNickname ?? null,
        agentAvatar: annotationRow.agentAvatar ?? null,
        agentAnnotationColor: annotationRow.agentAnnotationColor ?? null,
        userId: annotationRow.userId ?? null,
        userUsername: annotationRow.userUsername ?? null,
        userNickname: annotationRow.userNickname ?? null,
        userAvatar: annotationRow.userAvatar ?? null,
        userAnnotationColor: annotationRow.userAnnotationColor ?? null,
        distillationStatus: annotationRow.distillationStatus ?? null,
        distillationContent: annotationRow.distillationContent ?? null,
        distillationPublishedAt: annotationRow.distillationPublishedAt ?? null,
        distillationUpdatedAt: annotationRow.distillationUpdatedAt ?? null,
        distillationReviewSessions: annotationRow.distillationReviewSessions ?? null,
      },
      [],
    );

    expect(isPdfTextAnchor(annotation.anchor)).toBe(true);
    expect(annotation.anchor).toMatchObject({
      kind: 'pdf-text',
      pageIndex: 2,
      pageWidth: 612,
      pageHeight: 792,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });
  });
});

function annotationRecord(id: string, comments: Comment[]): Annotation {
  return {
    id,
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '。',
      start: 0,
      end: 2,
    },
    author: { kind: 'user', userId: 'user-test', username: 'reader' },
    color: '#f59e0b',
    comments,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}
