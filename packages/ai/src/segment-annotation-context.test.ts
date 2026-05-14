import { describe, expect, it } from 'vitest';
import type { Agent } from '@yomitomo/shared';
import { buildEpubBookIndex, epubIndexText } from '@yomitomo/core';
import {
  buildSegmentAnnotationTasks,
  segmentAnnotationContextPrompt,
} from './segment-annotation-context';

describe('segment annotation context', () => {
  it('injects current-chapter lexical passages as retrieved evidence', () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: [
          '人口红利在开头被定义为劳动力供给优势。',
          '产业升级让优势开始松动。',
          '这里再次讨论人口红利如何影响选择。',
        ],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-1',
      chapters,
      maxSegmentTextLength: 1,
      minSegmentTextLength: 1,
    });
    const text = epubIndexText(chapters);
    const tasks = buildSegmentAnnotationTasks(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        readingPlan: [
          {
            sectionId: 'chapter-1',
            sectionTitle: '第一章',
            sectionStart: ebookIndex.chapters[0]!.textStart,
            sectionEnd: ebookIndex.chapters[0]!.textEnd,
          },
        ],
        article: {
          title: '长书',
          url: 'ebook://book-1',
          text,
          ebookIndex,
        },
      },
      agent,
    );
    const task = tasks.find((item) => item.segment.id === 'chapter-1-segment-3');
    if (!task) throw new Error('third segment task should exist');

    const prompt = segmentAnnotationContextPrompt(task);

    expect(prompt).toContain('"type": "retrieved_evidence"');
    expect(prompt).toContain('"source": "current-chapter-lexical"');
    expect(prompt).toContain('人口红利在开头被定义为劳动力供给优势。');
    expect(prompt).toContain('不能从这些块里选 exact');
  });
});

const agent: Agent = {
  id: 'agent-lin',
  kind: 'annotation',
  providerId: 'provider-1',
  enabled: true,
  nickname: '林知微',
  username: 'lin',
  avatar: '',
  annotationColor: '#6fa48f',
  annotationDensity: 'medium',
  temperature: 0.35,
  soul: '你是林知微。',
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
};
