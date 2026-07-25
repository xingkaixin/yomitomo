import { describe, expect, it } from 'vitest';
import type { Agent } from '@yomitomo/shared';
import { buildEpubBookIndex, epubIndexText } from '@yomitomo/core';
import {
  buildSegmentAnnotationTasks,
  segmentAnnotationContextPrompt,
} from './segment-annotation-context';

describe('segment annotation context', () => {
  it('preserves plan order, clipped ranges, and spoiler exclusions', () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一章开头。', '第一章结论。'],
      },
      {
        id: 'chapter-2',
        title: '第二章',
        paragraphs: ['第二章开头。', '第二章反转。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-1',
      chapters,
      maxSegmentTextLength: 1,
      minSegmentTextLength: 1,
    });
    const text = epubIndexText(chapters);
    const firstChapter = ebookIndex.chapters[0];
    const secondChapter = ebookIndex.chapters[1];
    const clippedStart = text.indexOf('第一章结论');
    const tasks = buildSegmentAnnotationTasks(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        readingPlan: [
          {
            sectionId: secondChapter.id,
            sectionTitle: secondChapter.title,
            sectionStart: secondChapter.textStart,
            sectionEnd: secondChapter.textEnd,
          },
          {
            sectionId: firstChapter.id,
            sectionTitle: firstChapter.title,
            sectionStart: clippedStart,
            sectionEnd: firstChapter.textEnd,
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

    expect(
      tasks.map((task) => ({
        sectionId: task.planItem.sectionId,
        segmentId: task.segment.id,
        range: task.context.allowedAnchorRange,
        evidence: task.context.retrievedEvidence.map((passage) => passage.text),
      })),
    ).toEqual([
      {
        sectionId: 'chapter-2',
        segmentId: 'chapter-2-segment-1',
        range: {
          textStart: secondChapter.textStart,
          textEnd: ebookIndex.segments[2].textEnd,
        },
        evidence: [],
      },
      {
        sectionId: 'chapter-2',
        segmentId: 'chapter-2-segment-2',
        range: {
          textStart: ebookIndex.segments[3].textStart,
          textEnd: secondChapter.textEnd,
        },
        evidence: ['第二章开头。'],
      },
      {
        sectionId: 'chapter-1',
        segmentId: 'chapter-1-segment-2',
        range: {
          textStart: clippedStart,
          textEnd: firstChapter.textEnd,
        },
        evidence: ['第一章开头。'],
      },
    ]);
    expect(
      tasks.flatMap((task) => task.context.retrievedEvidence.map((passage) => passage.text)),
    ).not.toContain('第二章反转。');
  });

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
            sectionStart: ebookIndex.chapters[0].textStart,
            sectionEnd: ebookIndex.chapters[0].textEnd,
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

  it('splits a single overlong segment into bounded ranges', () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: [`开头。${'长段内容'.repeat(2600)}尾部。`],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const chapter = ebookIndex.chapters[0];
    const tasks = buildSegmentAnnotationTasks(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        readingPlan: [
          {
            sectionId: chapter.id,
            sectionTitle: chapter.title,
            sectionStart: chapter.textStart,
            sectionEnd: chapter.textEnd,
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

    expect(ebookIndex.segments).toHaveLength(1);
    expect(tasks.length).toBeGreaterThan(1);
    expect(tasks[0]?.context.currentSegment.text).toContain('开头。');
    expect(tasks[tasks.length - 1]?.context.currentSegment.text).toContain('尾部。');
    expect(tasks[0]?.context.allowedAnchorRange.textStart).toBe(chapter.textStart);
    expect(tasks[tasks.length - 1]?.context.allowedAnchorRange.textEnd).toBe(chapter.textEnd);
    for (let index = 1; index < tasks.length; index += 1) {
      expect(tasks[index]?.context.allowedAnchorRange.textStart).toBe(
        tasks[index - 1]?.context.allowedAnchorRange.textEnd,
      );
    }
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
