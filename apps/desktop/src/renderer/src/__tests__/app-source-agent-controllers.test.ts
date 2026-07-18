import { describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent } from '@yomitomo/shared';
import { buildAgentAnnotationRequestInput } from '../source/bookcase/app-source-agent-request';
import { createEbookSourceReaderController } from '../source/ebook/app-source-bookcase-ebook-controller';
import { createWebSourceReaderController } from '../source/web/app-source-bookcase-web-controller';
import type { PromptArticle } from '../shell/app-reading-types';
import type { ArticleAgentAnnotationMergeResult } from '../../../ipc-contract';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks(count = 4) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

const agent: PublicAgent = {
  id: 'agent_lin',
  kind: 'annotation',
  presetId: 'lin',
  enabled: true,
  nickname: 'Lin',
  username: 'lin',
  avatar: '',
  annotationColor: '#8a8f4f',
  annotationDensity: 'medium',
  temperature: 0.4,
  personalityName: 'Lin',
};

const article: PromptArticle = {
  title: '文章',
  url: 'https://example.com/article',
  text: '一二三四五六七八九十',
};

const annotation: Annotation = {
  id: 'annotation_1',
  author: 'ai',
  color: '#8a8f4f',
  anchor: {
    exact: '三四',
    prefix: '一二',
    suffix: '五六',
    start: 2,
    end: 4,
  },
  comments: [],
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const requestInput = buildAgentAnnotationRequestInput(agent, {}, { article, annotations: [] });

describe('source agent annotation controllers', () => {
  it('waits for article-scoped Web annotation persistence', async () => {
    const persistence = createDeferred<ArticleAgentAnnotationMergeResult | null>();
    const onMergeArticleAgentAnnotation = vi.fn(() => persistence.promise);
    const controller = createWebSourceReaderController({
      applyAnnotations: vi.fn(),
      currentArticleText: () => article.text,
      enqueueAgentAnnotation: vi.fn(),
      finishVirtualReading: vi.fn(),
      finishVirtualReadingIfIdle: vi.fn(),
      getAnnotations: () => [],
      isAgentAnnotating: () => false,
      isCurrentArticle: () => false,
      markAgentAnnotating: vi.fn(),
      markVirtualReadingDone: vi.fn(),
      onOpenAnnotation: vi.fn(),
      onMergeArticleAgentAnnotation,
      processAgentAnnotationQueue: vi.fn(),
      setStatusMessage: vi.fn(),
      startVirtualReading: vi.fn(),
    });

    const handling = Promise.resolve(
      controller.onAnnotation({
        agent,
        annotation,
        context: {
          article,
          articleId: 'article_background',
          articleScopedWrite: true,
          articleText: article.text,
          visibleArticle: false,
        },
        options: { articleId: 'article_background' },
        playback: undefined,
        requestInput,
      }),
    );
    const completed = vi.fn();
    void handling.then(completed);

    await flushMicrotasks();

    expect(onMergeArticleAgentAnnotation).toHaveBeenCalledWith('article_background', annotation);
    expect(completed).not.toHaveBeenCalled();

    persistence.resolve(null);

    await expect(handling).resolves.toBe(true);
  });

  it('waits for background EPUB annotation persistence', async () => {
    const persistence = createDeferred<string>();
    const appendAgentAnnotationToArticle = vi.fn(() => persistence.promise);
    const controller = createEbookSourceReaderController({
      appendAgentAnnotationToArticle,
      currentArticleText: () => article.text,
      enqueueAgentAnnotationPlayback: vi.fn(),
      finishAgentDock: vi.fn(),
      finishVirtualReading: vi.fn(),
      isAgentAnnotating: () => false,
      isCurrentArticle: () => false,
      setAgentAnnotating: vi.fn(),
      setStatusMessage: vi.fn(),
      startAgentDock: vi.fn(),
      startVirtualReading: vi.fn(),
      waitForPlaybackCompletion: vi.fn(async () => undefined),
    });

    const handling = Promise.resolve(
      controller.onAnnotation({
        agent,
        annotation,
        context: {
          article,
          articleId: 'article_background',
          articleText: article.text,
          visibleArticle: false,
        },
        options: { articleId: 'article_background' },
        playback: undefined,
        requestInput,
      }),
    );
    const completed = vi.fn();
    void handling.then(completed);

    await flushMicrotasks();

    expect(appendAgentAnnotationToArticle).toHaveBeenCalledWith('article_background', annotation);
    expect(completed).not.toHaveBeenCalled();

    persistence.resolve(annotation.id);

    await expect(handling).resolves.toBe(true);
  });
});
