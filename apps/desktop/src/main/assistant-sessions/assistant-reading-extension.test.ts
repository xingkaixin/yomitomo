import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { createRegistry } from '@earendil-works/pi-durable';
import { readingMemoryEntriesFromAnnotationThread } from '@yomitomo/core';
import type { Annotation, ReadingMemoryEntry } from '@yomitomo/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createAssistantReadingExtension, RunContextDoc } from './assistant-reading-extension';
import { createAssistantSessionStore } from './assistant-session-store';

const visible = '第一章 线索：VISIBLE_PLOT_SENTINEL。';
const future = '后文章节 线索：FUTURE_PLOT_SENTINEL。';
const text = `${visible}\n\n${future}`;
const timestamp = '2026-11-16T00:00:00.000Z';
const visibleRange = [{ textStart: 0, textEnd: visible.length }];

const visibleAnnotation: Annotation = {
  id: 'annotation_visible',
  anchor: { exact: visible, prefix: '', suffix: '', start: 0, end: visible.length },
  author: { kind: 'user', username: 'reader' },
  color: '#888888',
  comments: [
    {
      id: 'comment_visible',
      author: { kind: 'user', username: 'reader' },
      content: '前章讨论：VISIBLE_DISCUSSION_SENTINEL。',
      createdAt: timestamp,
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const futureAnnotation: Annotation = {
  id: 'annotation_future',
  anchor: {
    exact: future,
    prefix: '',
    suffix: '',
    start: 0,
    end: future.length,
    textStartInBook: visible.length + 2,
    textEndInBook: text.length,
  },
  author: { kind: 'user', username: 'reader' },
  color: '#888888',
  comments: [
    {
      id: 'comment_future',
      author: { kind: 'user', username: 'reader' },
      content: '后章讨论：FUTURE_DISCUSSION_SENTINEL。',
      createdAt: timestamp,
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const unlocatedEntry: ReadingMemoryEntry = {
  id: 'memory_unlocated',
  articleId: 'article_1',
  kind: 'summary',
  scope: 'book',
  visibility: 'default',
  payloadVersion: 1,
  sourceType: 'ai_task',
  sourceTaskId: 'task_1',
  sourceEntryIds: [],
  payload: { summary: '无定位讨论：FUTURE_DISCUSSION_SENTINEL。' },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const memoryEntries = [
  ...readingMemoryEntriesFromAnnotationThread({
    articleId: 'article_1',
    annotation: visibleAnnotation,
  }),
  ...readingMemoryEntriesFromAnnotationThread({
    articleId: 'article_1',
    annotation: futureAnnotation,
  }),
  unlocatedEntry,
];

let directory = '';

afterEach(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true });
    directory = '';
  }
});

async function runReadingTools(
  visibleRanges: Array<{ textStart: number; textEnd: number }> | null,
  toolCalls: ReturnType<typeof fauxToolCall>[],
) {
  directory = await mkdtemp(join(tmpdir(), 'assistant-reading-extension-'));
  const models = createModels();
  const registry = createRegistry();
  const seenSearchRanges: Array<Array<{ textStart: number; textEnd: number }> | null | undefined> =
    [];
  const reading = createAssistantReadingExtension({
    articleText: async () => ({
      text,
      sections: [
        { id: 'c1', title: '第一章', start: 0, end: visible.length },
        { id: 'c2', title: '后文章节', start: visible.length + 2, end: text.length },
      ],
    }),
    searchMemory: (input) => {
      seenSearchRanges.push(input.visibleRanges);
      return memoryEntries;
    },
    annotations: () => [visibleAnnotation, futureAnnotation],
    agentName: () => undefined,
  });
  registry.install(reading);

  const faux = fauxProvider({ provider: 'faux', models: [{ id: 'model' }] });
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(toolCalls, { stopReason: 'toolUse' }),
    fauxAssistantMessage('完成。'),
  ]);

  const store = createAssistantSessionStore({
    directory,
    harnessOptions: () => ({ models, registry, settings: { extensions: [reading] } }),
    logError: (_event, error) => {
      throw error;
    },
  });

  try {
    const resultsById = await store.use('article_1', async (harness) => {
      const conversation = await harness.createConversation(
        {
          ownership: { kind: 'ownerless' },
          agent: { model: { provider: 'faux', modelId: 'model' } },
          init: async (tx, id) => {
            Object.assign(await tx.doc(RunContextDoc, id), {
              articleId: 'article_1',
              articleTitle: '两章样本',
              agentId: 'agent_1',
              channelId: 'chat:test',
              visibleRanges,
              toolCalls: 0,
            });
          },
        },
        BACKGROUND_CONTEXT,
      );
      const settled = await (
        await conversation.submit({ type: 'input', content: '执行工具检查' }, BACKGROUND_CONTEXT)
      ).wait(BACKGROUND_CONTEXT);
      expect(settled.status).toBe('done');
      const entries = await conversation.entries({}, 50, undefined, BACKGROUND_CONTEXT);
      return new Map(
        entries.items
          .flatMap((entry) => entry.model ?? [])
          .filter((message) => message.role === 'toolResult')
          .map((result) => [
            result.toolCallId,
            {
              isError: result.isError,
              output: result.content
                .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                .join('\n'),
            },
          ]),
      );
    });
    return { resultsById, seenSearchRanges };
  } finally {
    await store.dispose();
  }
}

describe('assistant reading extension visibleRanges boundary', () => {
  it('allows reading chapter 1 across all four reading tools without leaking chapter 2 markers', async () => {
    const readVisibleCall = fauxToolCall('read_article', { sectionId: 'c1' });
    const readFutureCall = fauxToolCall('read_article', { sectionId: 'c2' });
    const searchArticleCall = fauxToolCall('search_article', { query: '线索' });
    const searchMemoryCall = fauxToolCall('search_reading_memory', { query: '讨论' });
    const threadVisibleCall = fauxToolCall('read_thread', {
      annotationId: 'annotation_visible',
    });
    const threadFutureCall = fauxToolCall('read_thread', {
      annotationId: 'annotation_future',
    });
    const threadMissingCall = fauxToolCall('read_thread', {
      annotationId: 'annotation_missing',
    });

    const { resultsById, seenSearchRanges } = await runReadingTools(visibleRange, [
      readVisibleCall,
      readFutureCall,
      searchArticleCall,
      searchMemoryCall,
      threadVisibleCall,
      threadFutureCall,
      threadMissingCall,
    ]);

    expect(resultsById.size).toBe(7);
    const readVisible = resultsById.get(readVisibleCall.id)!;
    const readFuture = resultsById.get(readFutureCall.id)!;
    const searchArticle = resultsById.get(searchArticleCall.id)!;
    const searchMemory = resultsById.get(searchMemoryCall.id)!;
    const threadVisible = resultsById.get(threadVisibleCall.id)!;
    const threadFuture = resultsById.get(threadFutureCall.id)!;
    const threadMissing = resultsById.get(threadMissingCall.id)!;

    expect(readVisible.isError).toBe(false);
    expect(readVisible.output).toContain('VISIBLE_PLOT_SENTINEL');
    expect(readFuture.output).not.toContain('FUTURE_PLOT_SENTINEL');

    expect(searchArticle.isError).toBe(false);
    expect(searchArticle.output).toContain('VISIBLE_PLOT_SENTINEL');
    expect(searchArticle.output).not.toContain('FUTURE_PLOT_SENTINEL');

    expect(seenSearchRanges).toEqual([visibleRange]);
    expect(searchMemory.isError).toBe(false);
    expect(searchMemory.output).toContain('VISIBLE_DISCUSSION_SENTINEL');
    expect(searchMemory.output).not.toContain('FUTURE_PLOT_SENTINEL');
    expect(searchMemory.output).not.toContain('FUTURE_DISCUSSION_SENTINEL');
    expect(searchMemory.output).not.toContain('annotation_future');

    expect(threadVisible.isError).toBe(false);
    expect(threadVisible.output).toContain('VISIBLE_DISCUSSION_SENTINEL');

    expect(threadFuture.isError).toBe(true);
    expect(threadFuture.output).toContain('批注 annotation_future 不存在或不在可读范围内。');
    expect(threadFuture.output).not.toContain('FUTURE_PLOT_SENTINEL');
    expect(threadFuture.output).not.toContain('FUTURE_DISCUSSION_SENTINEL');

    expect(threadMissing.isError).toBe(true);
    expect(threadMissing.output).toContain('批注 annotation_missing 不存在或不在可读范围内。');
    expect(threadFuture.output.replace('annotation_future', 'id')).toBe(
      threadMissing.output.replace('annotation_missing', 'id'),
    );
  });

  it('keeps annotations and memory entries readable when visibleRanges is null', async () => {
    const searchMemoryCall = fauxToolCall('search_reading_memory', { query: '讨论' });
    const threadFutureCall = fauxToolCall('read_thread', {
      annotationId: 'annotation_future',
    });

    const { resultsById, seenSearchRanges } = await runReadingTools(null, [
      searchMemoryCall,
      threadFutureCall,
    ]);

    expect(seenSearchRanges).toEqual([null]);
    expect(resultsById.get(searchMemoryCall.id)?.output).toContain('FUTURE_DISCUSSION_SENTINEL');
    expect(resultsById.get(threadFutureCall.id)?.isError).toBe(false);
    expect(resultsById.get(threadFutureCall.id)?.output).toContain('FUTURE_DISCUSSION_SENTINEL');
  });
});
