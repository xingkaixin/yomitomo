// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, ArticleSummaryRecord, WeReadBook } from '@yomitomo/shared';
import { defaultTheme } from '../theme/app-theme';
import { articleActionStubs } from './article-actions-test-utils';
import {
  annotation,
  annotationWithPublishedDistillation,
  article,
  articleStore,
  articleSummary,
  collectionActionStubs,
  flushMicrotasks,
  installDefaultCatalog,
  now,
  playAppSoundEffect,
  renderLibrary,
  selectLibraryType,
  TestReadingLibrary as ReadingLibrary,
  userProfile,
} from './app-reading-library-test-support';

describe('ReadingLibrary reading', () => {
  it('renders ebooks as list rows with cover progress', async () => {
    const coverUrl = 'data:image/jpeg;base64,ZmFrZS1jb3Zlcg==';
    const getArticleCover = vi.fn().mockResolvedValue(coverUrl);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { article: { getCover: getArticleCover } },
    });
    const { container } = renderLibrary([
      article({
        id: 'ebook_cover_progress',
        url: 'ebook://ebook_cover_progress',
        canonicalUrl: 'ebook://ebook_cover_progress',
        sourceType: 'ebook',
        title: '电子书标题',
        byline: '作者名',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'book.epub',
            fileSize: 1024,
            originalTitle: '电子书标题（名人推荐！荣获大奖！）',
            displayTitle: '旧展示标题',
            titleCleanupVersion: 1,
          },
          chapters: [],
        },
        annotations: [annotationWithPublishedDistillation('ebook_note')],
        readingProgress: {
          kind: 'chapter',
          chapterIndex: 2,
          chapterProgress: 0.4,
          bookProgress: 0.4,
          updatedAt: now,
        },
      }),
    ]);

    expect(screen.queryByRole('button', { name: '书架' })).toBeNull();
    expect(screen.queryByRole('button', { name: '列表' })).toBeNull();
    expect(screen.getAllByText('作者名').length).toBeGreaterThan(1);
    expect(screen.getAllByText('电子书标题').length).toBeGreaterThan(1);
    expect(screen.queryByText('电子书标题（名人推荐！荣获大奖！）')).toBeNull();
    const stats = screen.getByLabelText('1 条划线 · 1 条沉淀');
    expect(stats).toBeTruthy();
    expect(stats.getAttribute('title')).toBeNull();
    expect(
      Array.from(stats.querySelectorAll('.library-count-stat')).map((item) => item.textContent),
    ).toEqual(['1', '1']);
    expect(container.querySelector('.library-ebook-progress')).toBeTruthy();
    await waitFor(() => expect(getArticleCover).toHaveBeenCalledWith('ebook_cover_progress'));
    expect(container.querySelector('.article-book-cover-image')?.getAttribute('src')).toBe(
      coverUrl,
    );
  });

  it('cleans legacy ebook titles in the list when display title is missing', () => {
    renderLibrary([
      article({
        id: 'legacy_ebook',
        url: 'ebook://legacy_ebook',
        canonicalUrl: 'ebook://legacy_ebook',
        sourceType: 'ebook',
        title: '艾伦·图灵传——如谜的解谜者（87届奥斯卡最佳改编剧本奖《模仿游戏》原著',
        byline: '安德鲁·霍奇斯',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'turing.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
      }),
    ]);

    expect(screen.getAllByText('艾伦·图灵传——如谜的解谜者').length).toBeGreaterThan(0);
    expect(screen.queryByText(/87届奥斯卡/)).toBeNull();
  });

  it('recleans stale ebook display titles from older cleanup versions', () => {
    renderLibrary([
      article({
        id: 'stale_ebook',
        url: 'ebook://stale_ebook',
        canonicalUrl: 'ebook://stale_ebook',
        sourceType: 'ebook',
        title: '一个故事的 99种讲法【豆瓣评分9.0近500人标记',
        byline: '马特·马登',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'story.epub',
            fileSize: 1024,
            displayTitle: '一个故事的 99种讲法【豆瓣评分9.0近500人标记',
            titleCleanupVersion: 1,
          },
          chapters: [],
        },
      }),
    ]);

    expect(screen.getAllByText('一个故事的99种讲法').length).toBeGreaterThan(0);
    expect(screen.queryByText(/豆瓣评分/)).toBeNull();
  });

  it('cleans real legacy ebook metadata titles with publisher suffixes', () => {
    renderLibrary([
      article({
        id: 'story_99',
        url: 'ebook://story_99',
        canonicalUrl: 'ebook://story_99',
        sourceType: 'ebook',
        title:
          '一个故事的99种讲法【豆瓣评分9.0近500人标记，中文读者翘首以盼，风靡欧美的动漫画工作坊经典教科书，呈现讲述同一个故事的99种“脑洞”】浦睿文化出品',
        byline: '马特·马登',
        ebook: {
          metadata: {
            format: 'epub',
            fileName:
              '一个故事的99种讲法【豆瓣评分9.0近500人标记，中文读者翘首以盼，风靡欧美的动漫画工作坊经典教科书，呈现讲述同一个故事的99种“脑洞”】浦睿文化出品 - 马特·马登.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
      }),
    ]);

    expect(screen.getAllByText('一个故事的99种讲法').length).toBeGreaterThan(0);
    expect(screen.queryByText(/浦睿文化出品/)).toBeNull();
    expect(screen.queryByText(/豆瓣评分/)).toBeNull();
  });

  it('renders PDFs as document rows with metadata', async () => {
    renderLibrary([
      article({
        id: 'pdf_1',
        url: 'pdf:pdf_1',
        canonicalUrl: 'pdf:hash_1',
        sourceType: 'pdf',
        title: 'PDF 标题',
        byline: undefined,
        siteName: 'PDF',
        contentHtml: undefined,
        pdf: {
          metadata: {
            format: 'pdf',
            fileName: 'paper.pdf',
            author: 'BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL; JOHN SMITH',
            fileSize: 2048,
            pageCount: 12,
          },
        },
      }),
    ]);

    await selectLibraryType(/PDF/);

    expect(screen.getByText('共 1 份')).toBeTruthy();
    expect(screen.getByText('Basant Mounir; Farida Madkour et al.')).toBeTruthy();
    expect(screen.queryByText(/BASANT MOUNIR/)).toBeNull();
    expect(screen.queryByText('paper.pdf')).toBeNull();
    expect(screen.getAllByRole('button', { name: '打开PDF：PDF 标题' }).length).toBeGreaterThan(0);
  });

  it('renders WeRead books with the last read date but without reading time metadata', async () => {
    const book: WeReadBook = {
      bookId: 'weread_1',
      title: '微信读书标题',
      author: '微信作者',
      reviewCount: 1,
      noteCount: 2,
      bookmarkCount: 0,
      readingProgress: 12,
      readingTime: 420,
      lastReadAt: Date.parse('2026-05-28T08:00:00.000Z') / 1000,
      updatedAt: now,
    };
    const state = {
      settings: { configured: true, openMethod: 'deeplink' as const },
      books: [book],
    };
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getState: vi.fn().mockResolvedValue(state),
        sync: vi.fn().mockResolvedValue(state),
      },
    });

    renderLibrary([]);

    expect(
      (await screen.findAllByRole('button', { name: '打开微信读书笔记：微信读书标题' })).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('微信读书标题').length).toBeGreaterThan(0);
    expect(screen.getAllByText('05/28').length).toBeGreaterThan(0);
    expect(screen.queryByText('05/09')).toBeNull();
    expect(screen.queryByText(/阅读 7 分钟/)).toBeNull();
    expect(screen.queryByText(/微信读书进度/)).toBeNull();
    const stats = screen.getByLabelText('2 条划线 · 0 条沉淀');
    expect(stats).toBeTruthy();
    expect(
      Array.from(stats.querySelectorAll('.library-count-stat')).map((item) => item.textContent),
    ).toEqual(['2', '0']);
    expect(
      document
        .querySelector('.library-weread-list-item')
        ?.classList.contains('library-ebook-list-item'),
    ).toBe(true);
  });

  it('orders WeRead books by last read date', async () => {
    const state = {
      settings: { configured: true, openMethod: 'deeplink' as const },
      books: [
        {
          bookId: 'weread_old',
          title: '上次阅读较早',
          author: '微信作者',
          reviewCount: 0,
          noteCount: 0,
          bookmarkCount: 0,
          readingProgress: 12,
          lastReadAt: Date.parse('2026-05-01T08:00:00.000Z') / 1000,
          updatedAt: '2026-05-20T08:00:00.000Z',
        },
        {
          bookId: 'weread_new',
          title: '上次阅读较新',
          author: '微信作者',
          reviewCount: 0,
          noteCount: 0,
          bookmarkCount: 0,
          readingProgress: 12,
          lastReadAt: Date.parse('2026-05-10T08:00:00.000Z') / 1000,
          updatedAt: '2026-05-01T08:00:00.000Z',
        },
      ],
    };
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getState: vi.fn().mockResolvedValue(state),
        sync: vi.fn().mockResolvedValue(state),
      },
    });

    renderLibrary([]);

    await screen.findByRole('button', { name: '打开微信读书笔记：上次阅读较新' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((item) => item.textContent)).toEqual([
      '上次阅读较新',
      '上次阅读较早',
    ]);
  });

  it('keeps WeRead mixed when old source preferences disabled it without auto sync', async () => {
    const state = {
      settings: { configured: true, openMethod: 'deeplink' as const },
      books: [],
    };
    const syncWeRead = vi.fn().mockResolvedValue(state);
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getState: vi.fn().mockResolvedValue(state),
        sync: syncWeRead,
      },
    });

    renderLibrary([], {
      settings: {
        libraryContentSources: [
          { id: 'ebook', enabled: true },
          { id: 'web', enabled: false },
          { id: 'pdf', enabled: false },
          { id: 'weread', enabled: false },
        ],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '筛选内容类型' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: '网页文章' })).toBeTruthy();
    expect(await screen.findByRole('menuitemcheckbox', { name: '电子书' })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: 'PDF' })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: '微信读书' })).toBeTruthy();
    expect(syncWeRead).not.toHaveBeenCalled();
  });

  it('applies WeRead state updates emitted after main auto sync', async () => {
    const initialState = {
      settings: { configured: true, openMethod: 'deeplink' as const, syncMode: 'auto' as const },
      books: [],
    };
    const nextState = {
      settings: initialState.settings,
      books: [
        {
          bookId: 'weread_auto',
          title: '自动同步书籍',
          author: '微信作者',
          reviewCount: 0,
          noteCount: 0,
          bookmarkCount: 0,
          readingProgress: 20,
          updatedAt: now,
        },
      ],
    };
    const syncWeRead = vi.fn().mockResolvedValue(nextState);
    let emitWeReadState: ((state: typeof nextState) => void) | null = null;
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getState: vi.fn().mockResolvedValue(initialState),
        onStateUpdated: vi.fn((callback) => {
          emitWeReadState = callback;
          return vi.fn();
        }),
        sync: syncWeRead,
      },
    });

    renderLibrary([]);

    await waitFor(() => expect(emitWeReadState).toBeTypeOf('function'));
    expect(screen.queryByText('自动同步书籍')).toBeNull();
    act(() => emitWeReadState?.(nextState));

    expect((await screen.findAllByText('自动同步书籍')).length).toBeGreaterThan(0);
    expect(syncWeRead).not.toHaveBeenCalled();
  });

  it('loads the full article before opening a PDF summary', async () => {
    const pdfSummary = articleSummary(
      article({
        id: 'pdf_1',
        url: 'pdf:pdf_1',
        canonicalUrl: 'pdf:hash_1',
        sourceType: 'pdf',
        title: 'PDF 标题',
        siteName: 'PDF',
        pdf: {
          metadata: {
            format: 'pdf',
            fileName: 'paper.pdf',
            fileSize: 1024,
            pageCount: 12,
          },
        },
      }),
    );
    const onReadArticle = vi.fn().mockResolvedValue(null);
    renderLibrary([pdfSummary], { onReadArticle });

    fireEvent.click(screen.getAllByRole('button', { name: '打开PDF：PDF 标题' })[0]);

    await waitFor(() => {
      expect(onReadArticle).toHaveBeenCalledWith('pdf_1');
    });
  });

  it('exposes the full title on hover', () => {
    renderLibrary([
      article({
        siteIconUrl: '',
        title: '这是一段会在卡片上被截断的很长标题',
      }),
    ]);

    expect(screen.getByTitle('这是一段会在卡片上被截断的很长标题')).toBeTruthy();
  });

  it('opens a webpage article in the source reader', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderLibrary([article({ title: '网页文章' })]);

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：网页文章' })[0]);

    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();
    expect(
      document.querySelector('.library-bookcase-screen')?.getAttribute('data-route-transition'),
    ).toBe('enter-source');
    expect(screen.getAllByText('网页文章').length).toBeGreaterThan(0);
    expect(screen.getByText('正文')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    expect(
      document.querySelector('.library-bookcase-screen')?.getAttribute('data-route-transition'),
    ).toBe('enter-library');
    expect(screen.queryByText('正文')).toBeNull();
    expect(screen.getAllByRole('button', { name: '打开文章：网页文章' }).length).toBeGreaterThan(0);
  });

  it('refreshes the open article when its summary changes externally', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('yomitomoDesktop', {});
    const initialArticle = article({ title: '同步文章' });
    const updatedArticle = article({
      title: '同步文章',
      updatedAt: '2026-05-09T12:03:00.000Z',
      annotations: [
        {
          ...annotation('annotation_1'),
          comments: [
            {
              id: 'comment_1',
              author: {
                kind: 'agent',
                agentId: 'agent_1',
                username: 'assistant',
                nickname: '行开心',
              },
              content: '助手想法',
              createdAt: '2026-05-09T12:03:00.000Z',
            },
          ],
          updatedAt: '2026-05-09T12:03:00.000Z',
        },
      ],
    });
    const updatedSummary = articleSummary(updatedArticle);
    const onReadArticle = vi
      .fn<(articleId: string) => Promise<ArticleRecord | null>>()
      .mockResolvedValueOnce(initialArticle)
      .mockResolvedValue(updatedArticle);
    let setArticles!: (articles: ArticleSummaryRecord[]) => void;

    function Harness() {
      const [articles, updateArticles] = React.useState([articleSummary(initialArticle)]);
      setArticles = updateArticles;
      return (
        <ReadingLibrary
          agents={[]}
          articleActions={articleActionStubs({
            readArticle: (articleId) => onReadArticle(articleId),
          })}
          articleStore={articleStore}
          articles={articles}
          {...collectionActionStubs()}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
        />
      );
    }

    installDefaultCatalog([articleSummary(initialArticle)]);
    render(<Harness />);

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：同步文章' })[0]);
    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(1));

    act(() => {
      setArticles([updatedSummary]);
    });

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(2));
    expect(onReadArticle).toHaveBeenLastCalledWith('article_1');
  });

  it('refreshes the open article when an external delete removes its last thought', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('yomitomoDesktop', {});
    const initialArticle = article({
      title: '删除同步文章',
      annotations: [
        {
          ...annotation('annotation_1'),
          comments: [
            {
              id: 'comment_1',
              author: { kind: 'user', username: 'reader' },
              content: '待删除想法',
              createdAt: '2026-05-09T12:01:00.000Z',
            },
          ],
        },
      ],
    });
    const updatedArticle = article({
      title: '删除同步文章',
      annotations: [{ ...annotation('annotation_1'), comments: [] }],
    });
    const updatedSummary = articleSummary(updatedArticle);
    const onReadArticle = vi
      .fn<(articleId: string) => Promise<ArticleRecord | null>>()
      .mockResolvedValueOnce(initialArticle)
      .mockResolvedValue(updatedArticle);
    let setArticles!: (articles: ArticleSummaryRecord[]) => void;

    function Harness() {
      const [articles, updateArticles] = React.useState([articleSummary(initialArticle)]);
      setArticles = updateArticles;
      return (
        <ReadingLibrary
          agents={[]}
          articleActions={articleActionStubs({
            readArticle: (articleId) => onReadArticle(articleId),
          })}
          articleStore={articleStore}
          articles={articles}
          {...collectionActionStubs()}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
        />
      );
    }

    installDefaultCatalog([articleSummary(initialArticle)]);
    render(<Harness />);

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：删除同步文章' })[0]);
    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(1));

    act(() => {
      setArticles([updatedSummary]);
    });

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(2));
    expect(onReadArticle).toHaveBeenLastCalledWith('article_1');
  });

  it('plays the distillation committed sound for publish and update events', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    const cancelAnimationFrameMock = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
    window.requestAnimationFrame = requestAnimationFrameMock;
    window.cancelAnimationFrame = cancelAnimationFrameMock;
    let onCommitted:
      | ((event: {
          articleId: string;
          annotationId: string;
          transition: 'publish' | 'update' | 'unpublish';
        }) => void)
      | null = null;
    vi.stubGlobal('yomitomoDesktop', {
      annotations: {
        onDistillationCommitted: vi.fn((listener) => {
          onCommitted = listener;
          return vi.fn();
        }),
      },
    });
    const fullArticle = article({
      id: 'distillation_article',
      title: '沉淀文章',
    });
    const settings = {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.55,
    };
    renderLibrary([articleSummary(fullArticle)], {
      onReadArticle: vi.fn().mockResolvedValue(fullArticle),
      settings,
    });

    await waitFor(() => expect(onCommitted).toBeTruthy());

    await act(async () => {
      onCommitted?.({
        articleId: 'distillation_article',
        annotationId: 'missing_annotation',
        transition: 'publish',
      });
    });

    await waitFor(() => expect(playAppSoundEffect).toHaveBeenCalledTimes(1));
    expect(playAppSoundEffect).toHaveBeenNthCalledWith(
      1,
      'reader.distillation_committed',
      expect.objectContaining(settings),
    );

    await act(async () => {
      onCommitted?.({
        articleId: 'distillation_article',
        annotationId: 'missing_annotation',
        transition: 'update',
      });
    });

    await waitFor(() => expect(playAppSoundEffect).toHaveBeenCalledTimes(2));
    expect(playAppSoundEffect).toHaveBeenNthCalledWith(
      2,
      'reader.distillation_committed',
      expect.objectContaining(settings),
    );

    await act(async () => {
      onCommitted?.({
        articleId: 'distillation_article',
        annotationId: 'missing_annotation',
        transition: 'unpublish',
      });
    });

    await waitFor(() => expect(screen.getAllByText('沉淀文章').length).toBeGreaterThan(0));
    expect(playAppSoundEffect).toHaveBeenCalledTimes(2);
  });

  it('does not keep reloading when summary counts distillation review AI messages', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const reviewedAnnotation = annotationWithPublishedDistillation('reviewed_note');
    reviewedAnnotation.distillation = {
      ...reviewedAnnotation.distillation!,
      reviewSessions: [
        {
          id: 'review_session_1',
          agentId: 'agent_1',
          agentUsername: 'distiller',
          agentNickname: '沉淀助手',
          createdAt: now,
          updatedAt: now,
          messages: [
            {
              id: 'review_message_1',
              author: { kind: 'agent', agentId: 'agent_1', username: 'distiller' },
              content: '这里需要再压缩一点。',
              createdAt: now,
            },
          ],
        },
      ],
    };
    const fullArticle = article({
      id: 'reviewed_distillation_article',
      title: '评审沉淀文章',
      annotations: [reviewedAnnotation],
    });
    const summary = articleSummary(fullArticle);
    const onReadArticle = vi.fn().mockResolvedValue(fullArticle);
    renderLibrary([summary], { onReadArticle });

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：评审沉淀文章' })[0]);
    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();
    await act(async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });

    expect(onReadArticle.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('keeps publish morph at the annotation start state when summary sync arrives first', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    const cancelAnimationFrameMock = vi.fn((handle: number) => window.clearTimeout(handle));
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
    window.requestAnimationFrame = requestAnimationFrameMock;
    window.cancelAnimationFrame = cancelAnimationFrameMock;
    let onCommitted:
      | ((event: {
          articleId: string;
          annotationId: string;
          distillation?: Annotation['distillation'];
          transition: 'publish' | 'update' | 'unpublish';
        }) => void)
      | null = null;
    vi.stubGlobal('yomitomoDesktop', {
      annotations: {
        onDistillationCommitted: vi.fn((listener) => {
          onCommitted = listener;
          return vi.fn();
        }),
      },
    });
    const initialAnnotation = {
      ...annotation('note_1'),
      distillation: {
        status: 'unpublished' as const,
        content: '沉淀 note_1',
        updatedAt: '2026-05-09T12:00:00.000Z',
      },
    };
    const publishedAnnotation = {
      ...initialAnnotation,
      distillation: {
        ...initialAnnotation.distillation,
        status: 'published' as const,
        publishedAt: '2026-05-09T12:03:00.000Z',
        updatedAt: '2026-05-09T12:03:00.000Z',
      },
    };
    const initialArticle = article({
      title: '同步沉淀文章',
      annotations: [initialAnnotation],
      updatedAt: '2026-05-09T12:00:00.000Z',
    });
    const publishedArticle = article({
      title: '同步沉淀文章',
      annotations: [publishedAnnotation],
      updatedAt: '2026-05-09T12:03:00.000Z',
    });
    const publishedSummary = articleSummary(publishedArticle);
    const onReadArticle = vi
      .fn<(articleId: string) => Promise<ArticleRecord | null>>()
      .mockResolvedValueOnce(initialArticle)
      .mockResolvedValue(publishedArticle);
    let setArticles!: (articles: ArticleSummaryRecord[]) => void;

    function Harness() {
      const [articles, updateArticles] = React.useState([articleSummary(initialArticle)]);
      setArticles = updateArticles;
      return (
        <ReadingLibrary
          agents={[]}
          articleActions={articleActionStubs({
            readArticle: (articleId) => onReadArticle(articleId),
          })}
          articleStore={articleStore}
          articles={articles}
          {...collectionActionStubs()}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
        />
      );
    }

    installDefaultCatalog([articleSummary(initialArticle)]);
    render(<Harness />);

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：同步沉淀文章' })[0]);
    await flushMicrotasks();
    expect(onReadArticle).toHaveBeenCalledTimes(1);
    expect(onCommitted).toBeTruthy();

    act(() => {
      setArticles([publishedSummary]);
    });
    await flushMicrotasks();
    expect(onReadArticle).toHaveBeenCalledTimes(2);

    await act(async () => {
      onCommitted?.({
        articleId: 'article_1',
        annotationId: 'note_1',
        distillation: publishedAnnotation.distillation,
        transition: 'publish',
      });
    });
    await flushMicrotasks();
    for (let frame = 0; frame < 40; frame += 1) {
      await act(async () => {
        await vi.advanceTimersToNextTimerAsync();
      });
      await flushMicrotasks();
      if (document.querySelector('.reader-note.is-distillation-dual-morph')) break;
    }

    expect(document.querySelector('.reader-note.is-distillation-dual-morph')).toBeTruthy();
    expect(document.querySelector('.reader-note.is-dual-show-anno')).toBeTruthy();
    expect(document.querySelector('.reader-note.is-dual-show-dist')).toBeNull();
    cleanup();
    vi.useRealTimers();
  });

  it('saves webpage reading progress from the reader scroll position', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const onSaveArticleReadingProgress = vi.fn();
    const requestAnimationFrame = vi
      .fn()
      .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    const cancelAnimationFrame = vi
      .fn()
      .mockImplementation((handle: number) => window.clearTimeout(handle));
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    renderLibrary(
      [
        article({
          id: 'web_progress',
          title: '网页进度文章',
          contentHtml: '<p>第一段</p><p>第二段</p><p>第三段</p>',
        }),
      ],
      { onSaveArticleReadingProgress },
    );

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：网页进度文章' })[0]);
    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();

    const surface = document.querySelector<HTMLElement>('.reader-surface');
    expect(surface).toBeTruthy();
    Object.defineProperties(surface!, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1500 },
      scrollTop: { configurable: true, value: 300, writable: true },
    });
    fireEvent.scroll(surface!);

    await waitFor(() => expect(onSaveArticleReadingProgress).toHaveBeenCalled());
    expect(onSaveArticleReadingProgress).toHaveBeenLastCalledWith(
      'web_progress',
      expect.objectContaining({
        kind: 'scroll',
        progress: 0.3,
      }),
    );
  });

  it('returns to the mixed library after reading an ebook', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderLibrary([
      article({ id: 'web_1', title: '网页文章' }),
      article({
        id: 'ebook_1',
        url: 'ebook://ebook_1',
        canonicalUrl: 'ebook://ebook_1',
        sourceType: 'ebook',
        title: '电子书标题',
        contentHtml: '<p>书正文</p>',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'book.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
      }),
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: '打开电子书：电子书标题' })[0]);
    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    expect(
      screen.getAllByRole('button', { name: '打开电子书：电子书标题' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '打开文章：网页文章' }).length).toBeGreaterThan(0);
  });
});
