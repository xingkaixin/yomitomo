import { describe, expect, it } from 'vitest';
import type { Agent, Annotation, TextAnchor } from '@yomitomo/shared';
import {
  buildEpubBookIndex,
  buildReadingContextBundle,
  createEpubTextAnchor,
  epubIndexText,
} from '@yomitomo/core';
import {
  buildSelectionAnnotationContext,
  selectionAnnotationContextPrompt,
} from './selection-context';

describe('selection annotation context', () => {
  it('builds selection-first context with local paragraphs, position, and nearby annotations', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['第一章背景。'] },
      {
        id: 'chapter-2',
        title: '第二章',
        paragraphs: ['第二章开头。', '第二章目标论证。', '第二章后续说明。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const targetAnchor = anchorForText(ebookIndex, text, '第二章目标论证');
    const nearbyAnchor = anchorForText(ebookIndex, text, '第二章开头');
    const segment = ebookIndex.segments.find((item) => item.chapterId === 'chapter-2');
    const readUntilTextOffset = text.indexOf('第二章后续说明') + '第二章后续说明。'.length;
    const readingContext = buildReadingContextBundle({
      articleText: text,
      ebookIndex,
      targetAnchor,
      readerProgress: {
        currentChapterId: 'chapter-2',
        currentSegmentId: segment?.id,
        readChapterIds: ['chapter-1'],
        readUntilTextOffset,
      },
    });

    const context = buildSelectionAnnotationContext(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        targetAnchor,
        annotations: [annotation(nearbyAnchor, '已有批注会影响这段理解。')],
        article: {
          title: '长书',
          url: 'ebook://book-1',
          text,
          ebookIndex,
        },
      },
      agent,
      readingContext,
    );
    const prompt = selectionAnnotationContextPrompt(expectContext(context));

    expect(prompt).toContain('selection-first 上下文');
    expect(prompt).toContain('第二章开头。');
    expect(prompt).toContain('第二章目标论证。');
    expect(prompt).toContain('第二章后续说明。');
    expect(prompt).toContain('章节位置：第 2 章《第二章》。');
    expect(prompt).toContain('"chapterId": "chapter-2"');
    expect(prompt).toContain('"paragraphId": "chapter-2-paragraph-2"');
    expect(prompt).toContain('已有批注会影响这段理解。');
  });

  it('preserves local context budget for a long selection', () => {
    const longSelection = '长选区'.repeat(4000);
    const chapters = [
      {
        id: 'chapter-1',
        title: '长选区章节',
        paragraphs: ['前置段落。', longSelection, '后续段落。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const targetAnchor = anchorForText(ebookIndex, text, longSelection);

    const context = buildSelectionAnnotationContext(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        targetAnchor,
        article: {
          title: '长书',
          url: 'ebook://book-1',
          text,
          ebookIndex,
        },
      },
      agent,
    );
    const prompt = selectionAnnotationContextPrompt(expectContext(context));

    expect(prompt).toContain('前置段落。');
    expect(prompt).toContain('"type": "local_window"');
    expect(prompt).toContain('"truncated": true');
  });

  it('keeps chapter-edge windows inside the selected chapter', () => {
    const chapters = [
      { id: 'chapter-1', title: '上一章', paragraphs: ['上一章末尾。'] },
      {
        id: 'chapter-2',
        title: '当前章',
        paragraphs: ['章首目标。', '中间段落。', '章尾目标。'],
      },
      { id: 'chapter-3', title: '下一章', paragraphs: ['下一章开头。'] },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);

    const startPrompt = promptForTarget(ebookIndex, text, '章首目标');
    expect(startPrompt).toContain('章首目标。');
    expect(startPrompt).not.toContain('上一章末尾。');

    const endPrompt = promptForTarget(ebookIndex, text, '章尾目标');
    expect(endPrompt).toContain('章尾目标');
    expect(endPrompt).not.toContain('下一章开头。');
  });

  it('falls back to anchor context when the selection cannot be located in the index', () => {
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters: [] });
    const targetAnchor: TextAnchor = {
      exact: '失效选区',
      prefix: '前缀上下文',
      suffix: '后缀上下文',
      start: 0,
      end: 4,
    };

    const context = buildSelectionAnnotationContext(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        targetAnchor,
        article: {
          title: '长书',
          url: 'ebook://book-1',
          text: '正文已经变化',
          ebookIndex,
        },
      },
      agent,
      buildReadingContextBundle({
        articleText: '正文已经变化',
        ebookIndex,
        targetAnchor,
      }),
    );
    const prompt = selectionAnnotationContextPrompt(expectContext(context));

    expect(prompt).toContain('前缀上下文');
    expect(prompt).toContain('失效选区');
    expect(prompt).toContain('后缀上下文');
    expect(prompt).toContain('"source": "anchor-context"');
  });
});

function promptForTarget(
  ebookIndex: ReturnType<typeof buildEpubBookIndex>,
  text: string,
  exact: string,
) {
  const targetAnchor = anchorForText(ebookIndex, text, exact);
  const readingContext = buildReadingContextBundle({
    articleText: text,
    ebookIndex,
    targetAnchor,
  });
  const context = buildSelectionAnnotationContext(
    {
      agentId: agent.id,
      agentUsername: agent.username,
      targetAnchor,
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    },
    agent,
    readingContext,
  );
  return selectionAnnotationContextPrompt(expectContext(context));
}

function anchorForText(
  ebookIndex: ReturnType<typeof buildEpubBookIndex>,
  text: string,
  exact: string,
) {
  const start = text.indexOf(exact);
  return createEpubTextAnchor(ebookIndex, text, start, start + exact.length);
}

function annotation(anchor: TextAnchor, comment: string): Annotation {
  return {
    id: 'annotation-nearby',
    anchor,
    author: 'user',
    color: '#6fa48f',
    userId: 'user-1',
    userUsername: 'reader',
    userNickname: '读者',
    comments: [
      {
        id: 'comment-nearby',
        author: 'user',
        content: comment,
        createdAt: '2026-05-13T00:00:00.000Z',
        userId: 'user-1',
        userUsername: 'reader',
        userNickname: '读者',
      },
    ],
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
  };
}

function expectContext(
  context: ReturnType<typeof buildSelectionAnnotationContext>,
): NonNullable<ReturnType<typeof buildSelectionAnnotationContext>> {
  if (!context) throw new Error('selection context should exist');
  return context;
}

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
