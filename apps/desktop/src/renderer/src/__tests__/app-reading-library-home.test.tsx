// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSummaryRecord,
  AppSettings,
  Collection,
  CollectionMember,
  LibraryPin,
  UserProfile,
  WeReadBook,
} from '@yomitomo/shared';
import {
  ReadingLibrary,
  articleDistillationStateChanged,
  articleWithCommittedDistillation,
  articleWithDistillationAnimationStart,
  groupLibraryArticles,
  nextDistillationAnimationArticleUpdatedAt,
} from '../reading-library/app-reading-library';
import type { AppMenuCommandRequest } from '../../../app-menu-types';
import { librarySession } from '../reading-library/app-reading-library-session';
import { initializeAppI18n } from '../i18n/app-i18n';
import { defaultTheme } from '../theme/app-theme';
import { playAppSoundEffect } from '../sound/app-sound-effects';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

const now = '2026-05-09T12:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  delete document.documentElement.dataset.themeTone;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  initializeAppI18n('zh-CN');
  document.documentElement.dataset.themeTone = defaultTheme.meta.tone;
  librarySession.searchQuery = '';
  librarySession.selectedTypes = new Set();
  librarySession.activeCollectionId = null;
});

function annotation(id: string, createdAt = now): Annotation {
  return {
    id,
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 2,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '文章',
    byline: '作者',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function articleSummary(record: ArticleRecord): ArticleSummaryRecord {
  const summary = { ...record };
  delete summary.contentHtml;
  delete summary.focusCoReadingPlan;
  if (summary.ebook) {
    return {
      ...summary,
      ebook: { metadata: summary.ebook.metadata },
    };
  }
  return summary;
}

function annotationWithPublishedDistillation(id: string): Annotation {
  return {
    ...annotation(id),
    distillation: {
      status: 'published',
      content: `沉淀 ${id}`,
      publishedAt: '2026-05-09T12:04:00.000Z',
    },
  };
}

function completedArticle(): ArticleRecord {
  return article({
    id: 'article_done',
    title: '完成阅读',
    annotations: [annotation('annotation_done')],
    readingProgress: {
      pageIndex: 10,
      pageCount: 10,
      progress: 1,
      updatedAt: '2026-05-09T12:03:00.000Z',
    },
  });
}

function renderLibrary(
  articles: ArticleSummaryRecord[],
  options: {
    onImportArticleUrl?: (
      url: string,
      requestId?: string,
    ) => Promise<
      { status: 'canceled' } | { status: 'imported' | 'duplicate'; article: ArticleRecord }
    >;
    onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
    onImportEbookFile?: (
      file: File,
      onProgress?: (progress: number) => void,
    ) => Promise<{ status: 'imported' | 'duplicate'; article: ArticleRecord }>;
    onImportPdfFile?: (
      file: File,
      onProgress?: (progress: number) => void,
    ) => Promise<{ status: 'imported' | 'duplicate'; article: ArticleRecord }>;
    onReadArticle?: (articleId: string) => Promise<ArticleRecord | null>;
    onDeleteArticle?: (articleId: string) => Promise<void> | void;
    onSaveArticleReadingProgress?: (
      articleId: string,
      progress: ArticleReadingProgress,
    ) => Promise<void> | void;
    onSaveSettings?: (settings: AppSettings) => Promise<void> | void;
    onOpenDataSources?: () => void;
    collections?: Collection[];
    collectionMembers?: CollectionMember[];
    menuRequest?: AppMenuCommandRequest | null;
    pins?: LibraryPin[];
    settings?: AppSettings;
  } = {},
) {
  return render(
    <ReadingLibrary
      agents={[]}
      articles={articles}
      collectionMembers={options.collectionMembers}
      collections={options.collections}
      menuRequest={options.menuRequest}
      pins={options.pins}
      readerTheme={defaultTheme.reader}
      settings={options.settings}
      userProfile={userProfile}
      onDeleteArticle={options.onDeleteArticle || vi.fn()}
      onImportEbookFile={options.onImportEbookFile || vi.fn()}
      onImportPdfFile={options.onImportPdfFile || vi.fn()}
      onImportArticleUrl={options.onImportArticleUrl || vi.fn()}
      onCancelArticleImport={options.onCancelArticleImport}
      onReadArticle={
        options.onReadArticle ||
        (async (articleId) =>
          (articles.find((item) => item.id === articleId) as ArticleRecord | undefined) || null)
      }
      onSaveArticle={vi.fn()}
      onSaveArticleReadingProgress={options.onSaveArticleReadingProgress || vi.fn()}
      onSaveSettings={options.onSaveSettings}
      onOpenDataSources={options.onOpenDataSources}
      onUpdateArticle={vi.fn()}
    />,
  );
}

function fileWithSize(name: string, size: number): File {
  const file = new File(['content'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function selectImportFile(container: HTMLElement, inputId: string, file: File) {
  selectImportFiles(container, inputId, [file]);
}

function selectImportFiles(container: HTMLElement, inputId: string, files: File[]) {
  const input =
    container.querySelector<HTMLInputElement>(`#${inputId}`) ||
    document.querySelector<HTMLInputElement>(`#${inputId}`);
  expect(input).toBeTruthy();
  fireEvent.change(input!, { target: { files } });
}

function deferredImportResult() {
  let resolve!: (value: { status: 'imported'; article: ArticleRecord }) => void;
  const promise = new Promise<{ status: 'imported'; article: ArticleRecord }>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function hasScheduledDelay(setTimeoutSpy: { mock: { calls: Array<unknown[]> } }, delayMs: number) {
  return setTimeoutSpy.mock.calls.some((call) => call[1] === delayMs);
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
  });
}

async function selectLibraryType(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: '筛选内容类型' }));
  const option = await screen.findByRole('menuitemcheckbox', { name });
  fireEvent.click(option);
}

async function openAddMenuItem(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: '添加内容' }));
  const item = await screen.findByRole('menuitem', { name });
  fireEvent.click(item);
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('groupLibraryArticles', () => {
  it('groups recent reading by article update time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:00:00.000+08:00'));

    const olderAddedRecentRead = article({
      id: 'older_added_recent_read',
      createdAt: '2026-05-05T09:00:00.000+08:00',
      updatedAt: '2026-05-09T10:00:00.000+08:00',
    });
    const todayAddedRead = article({
      id: 'today_added_read',
      createdAt: '2026-05-09T08:00:00.000+08:00',
      updatedAt: '2026-05-09T09:00:00.000+08:00',
    });
    const olderAddedStaleRead = article({
      id: 'older_added_stale_read',
      createdAt: '2026-05-05T08:00:00.000+08:00',
      updatedAt: '2026-05-01T09:00:00.000+08:00',
    });

    expect(
      groupLibraryArticles(
        [olderAddedRecentRead, todayAddedRead, olderAddedStaleRead],
        'recentReading',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '今天', ids: ['older_added_recent_read', 'today_added_read'] },
      { label: '更早', ids: ['older_added_stale_read'] },
    ]);
  });

  it('groups count-based sorts by their selected count', () => {
    expect(
      groupLibraryArticles(
        [
          article({ id: 'two_annotations', annotations: [annotation('a1'), annotation('a2')] }),
          article({ id: 'one_annotation', annotations: [annotation('a3')] }),
          article({ id: 'also_one_annotation', annotations: [annotation('a4')] }),
          article({ id: 'no_annotations', annotations: [] }),
        ],
        'annotations',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '2 条划线', ids: ['two_annotations'] },
      { label: '1 条划线', ids: ['one_annotation', 'also_one_annotation'] },
      { label: '暂无划线', ids: ['no_annotations'] },
    ]);

    expect(
      groupLibraryArticles(
        [
          article({
            id: 'two_distillations',
            annotations: [
              annotationWithPublishedDistillation('d1'),
              annotationWithPublishedDistillation('d2'),
            ],
          }),
          article({ id: 'no_distillations', annotations: [annotation('d3')] }),
        ],
        'discussions',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '2 条沉淀', ids: ['two_distillations'] },
      { label: '暂无沉淀', ids: ['no_distillations'] },
    ]);
  });
});

describe('articleWithDistillationAnimationStart', () => {
  it('starts publish morph from the unpublished annotation card state', () => {
    const published = annotationWithPublishedDistillation('note_1');
    const result = articleWithDistillationAnimationStart(
      article({ annotations: [published] }),
      {
        articleId: 'article_1',
        annotationId: 'note_1',
        distillation: published.distillation,
        transition: 'publish',
      },
      '2026-05-09T12:04:00.001Z',
    );

    expect(result.annotations[0]?.distillation?.status).toBe('unpublished');
    expect(result.updatedAt).toBe('2026-05-09T12:04:00.001Z');
  });

  it('starts unpublish morph from the published distillation card state', () => {
    const unpublished = {
      ...annotationWithPublishedDistillation('note_1'),
      distillation: {
        status: 'unpublished' as const,
        content: '沉淀 note_1',
        publishedAt: '2026-05-09T12:04:00.000Z',
      },
    };
    const result = articleWithDistillationAnimationStart(article({ annotations: [unpublished] }), {
      articleId: 'article_1',
      annotationId: 'note_1',
      distillation: unpublished.distillation,
      transition: 'unpublish',
    });

    expect(result.annotations[0]?.distillation?.status).toBe('published');
  });

  it('commits publish morph to a newer published article state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:04:00.020Z'));

    const published = annotationWithPublishedDistillation('note_1');
    const currentArticle = article({
      updatedAt: '2026-05-09T12:04:00.000Z',
      annotations: [
        {
          ...published,
          distillation: {
            ...published.distillation!,
            status: 'unpublished',
            updatedAt: '2026-05-09T12:04:00.000Z',
          },
        },
      ],
    });
    const result = articleWithCommittedDistillation(currentArticle, {
      articleId: 'article_1',
      annotationId: 'note_1',
      distillation: currentArticle.annotations[0]?.distillation,
      transition: 'publish',
    });

    expect(result.annotations[0]?.distillation?.status).toBe('published');
    expect(Date.parse(result.updatedAt)).toBeGreaterThan(Date.parse(currentArticle.updatedAt));
  });

  it('commits unpublish morph to a newer annotation card state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:04:00.020Z'));

    const published = annotationWithPublishedDistillation('note_1');
    const currentArticle = article({
      updatedAt: '2026-05-09T12:04:00.000Z',
      annotations: [
        {
          ...published,
          distillation: {
            ...published.distillation!,
            status: 'published',
            updatedAt: '2026-05-09T12:04:00.000Z',
          },
        },
      ],
    });
    const result = articleWithCommittedDistillation(currentArticle, {
      articleId: 'article_1',
      annotationId: 'note_1',
      distillation: currentArticle.annotations[0]?.distillation,
      transition: 'unpublish',
    });

    expect(result.annotations[0]?.distillation?.status).toBe('unpublished');
    expect(Date.parse(result.updatedAt)).toBeGreaterThan(Date.parse(currentArticle.updatedAt));
  });

  it('keeps repeated distillation morph article timestamps monotonic', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:04:00.000Z'));

    const previousAnimationUpdatedAt = '2026-05-09T12:04:00.020Z';
    const nextUpdatedAt = nextDistillationAnimationArticleUpdatedAt(
      '2026-05-09T12:04:00.000Z',
      '2026-05-09T12:04:00.000Z',
      previousAnimationUpdatedAt,
    );

    expect(Date.parse(nextUpdatedAt)).toBeGreaterThan(Date.parse(previousAnimationUpdatedAt));
  });

  it('detects distillation status changes separately from other article syncs', () => {
    const previous = article({
      annotations: [
        {
          ...annotation('note_1'),
          distillation: {
            status: 'unpublished',
            content: '沉淀 note_1',
          },
        },
      ],
    });
    const next = article({
      annotations: [
        {
          ...annotation('note_1'),
          distillation: {
            status: 'published',
            content: '沉淀 note_1',
            publishedAt: '2026-05-09T12:03:00.000Z',
          },
        },
      ],
    });

    expect(articleDistillationStateChanged(previous, next)).toBe(true);
    expect(
      articleDistillationStateChanged(previous, {
        ...previous,
        updatedAt: '2026-05-09T12:03:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('ReadingLibrary home', () => {
  it('renders a single mixed grid sorted by added time', () => {
    renderLibrary([
      article({
        id: 'older_web',
        title: '较早网页',
        createdAt: '2026-05-01T12:00:00.000Z',
        updatedAt: '2026-05-20T12:00:00.000Z',
      }),
      article({
        id: 'newer_pdf',
        url: 'pdf:newer_pdf',
        canonicalUrl: 'pdf:hash_newer',
        sourceType: 'pdf',
        title: '较新 PDF',
        createdAt: '2026-05-10T12:00:00.000Z',
        updatedAt: '2026-05-01T12:00:00.000Z',
      }),
    ]);

    expect(screen.queryByRole('tablist', { name: '阅读库内容类型' })).toBeNull();
    expect(screen.getByRole('button', { name: '筛选内容类型' }).textContent).toContain('全部');
    expect(screen.getAllByRole('heading', { level: 3 }).map((item) => item.textContent)).toEqual([
      '较新 PDF',
      '较早网页',
    ]);
    expect(screen.queryByText('最近更新 · 降序')).toBeNull();
    expect(screen.getByText('共 2 项')).toBeTruthy();
  });

  it('orders pinned items in the same grid without a pinned group heading', () => {
    renderLibrary(
      [
        article({
          id: 'unpinned_newest',
          title: '未置顶最新',
          createdAt: '2026-05-20T12:00:00.000Z',
          updatedAt: '2026-05-01T12:00:00.000Z',
        }),
        article({
          id: 'pinned_older',
          title: '置顶较早',
          createdAt: '2026-05-01T12:00:00.000Z',
          updatedAt: '2026-05-20T12:00:00.000Z',
        }),
        article({
          id: 'pinned_newer',
          title: '置顶较新',
          createdAt: '2026-05-10T12:00:00.000Z',
          updatedAt: '2026-05-01T12:00:00.000Z',
        }),
      ],
      {
        pins: [
          {
            targetKind: 'article',
            targetId: 'pinned_older',
            pinnedAt: '2026-06-20T12:00:00.000Z',
          },
          {
            targetKind: 'article',
            targetId: 'pinned_newer',
            pinnedAt: '2026-06-21T12:00:00.000Z',
          },
        ],
      },
    );

    expect(screen.queryByRole('heading', { name: '置顶' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 3 }).map((item) => item.textContent)).toEqual([
      '置顶较新',
      '置顶较早',
      '未置顶最新',
    ]);
  });

  it('orders collections by created time instead of updated time', () => {
    const olderCollection: Collection = {
      id: 'collection_older',
      name: '较早合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-20T12:00:00.000Z',
    };
    const newerCollection: Collection = {
      id: 'collection_newer',
      name: '较新合集',
      createdAt: '2026-05-10T12:00:00.000Z',
      updatedAt: '2026-05-01T12:00:00.000Z',
    };

    renderLibrary([], { collections: [olderCollection, newerCollection] });

    expect(screen.getAllByRole('article').map((item) => item.getAttribute('aria-label'))).toEqual([
      '较新合集',
      '较早合集',
    ]);
  });

  it('keeps local articles in the mixed grid when only the WeRead source is enabled', async () => {
    const state = {
      settings: { configured: true, openMethod: 'deeplink' as const },
      books: [
        {
          bookId: 'weread_1',
          title: '微信读书标题',
          author: '微信作者',
          reviewCount: 0,
          noteCount: 0,
          bookmarkCount: 0,
          readingProgress: 20,
          updatedAt: now,
        },
      ],
    };
    vi.stubGlobal('yomitomoDesktop', {
      getWeReadState: vi.fn().mockResolvedValue(state),
      syncWeRead: vi.fn().mockResolvedValue(state),
    });

    renderLibrary(
      [
        article({ id: 'web_1', title: '网页文章' }),
        article({
          id: 'pdf_1',
          url: 'pdf:pdf_1',
          canonicalUrl: 'pdf:hash_1',
          sourceType: 'pdf',
          title: 'PDF 标题',
        }),
      ],
      {
        settings: {
          libraryContentSources: [
            { id: 'web', enabled: false },
            { id: 'ebook', enabled: false },
            { id: 'pdf', enabled: false },
            { id: 'weread', enabled: true },
          ],
        },
      },
    );

    expect(screen.getAllByText('网页文章').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PDF 标题').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('微信读书标题')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '同步微信读书' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '筛选内容类型' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: '网页文章' })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: 'PDF' })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: '微信读书' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '添加内容' }));
    expect(await screen.findByRole('menuitem', { name: '同步微信读书' })).toBeTruthy();
  });

  it('filters the mixed grid by type scope', async () => {
    renderLibrary([
      article({ id: 'web_1', title: '网页文章' }),
      article({
        id: 'ebook_1',
        url: 'ebook://ebook_1',
        canonicalUrl: 'ebook://ebook_1',
        sourceType: 'ebook',
        title: '电子书标题',
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

    await selectLibraryType(/电子书/);

    expect(screen.getByText('共 1 本')).toBeTruthy();
    expect(screen.getAllByText('电子书标题').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '打开文章：网页文章' })).toBeNull();
    expect(screen.getByRole('button', { name: '移除电子书' })).toBeTruthy();
    expect(document.querySelector('.library-filter-chips')).toBeNull();
    expect(document.querySelector('.library-toolbar')).toBeNull();
    expect(screen.getByRole('button', { name: '添加内容' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '添加电子书' })).toBeNull();
  });

  it('keeps search query and type filter across remounts within the session', async () => {
    const articles = [article({ id: 'web_1', title: '网页文章' })];
    renderLibrary(articles);

    fireEvent.change(screen.getByLabelText('搜索文章、合集、作者或来源'), {
      target: { value: '关键字' },
    });
    await selectLibraryType(/网页文章/);
    expect(screen.getByRole('button', { name: '移除网页文章' })).toBeTruthy();

    // 模拟切到其他菜单或进入文章：卸载后再次进入阅读库
    cleanup();
    renderLibrary(articles);

    expect(screen.getByLabelText<HTMLInputElement>('搜索文章、合集、作者或来源').value).toBe(
      '关键字',
    );
    expect(screen.getByRole('button', { name: '移除网页文章' })).toBeTruthy();
  });

  it('reverts to all when every type is selected', async () => {
    renderLibrary([article({ id: 'web_1', title: '网页文章' })]);

    fireEvent.click(screen.getByRole('button', { name: '筛选内容类型' }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: '合集' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '网页文章' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '电子书' }));
    expect(screen.getByRole('button', { name: '移除网页文章' })).toBeTruthy();

    // 选满最后一个类型后应回退到「全部」
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'PDF' }));

    expect(screen.queryByRole('button', { name: '移除网页文章' })).toBeNull();
    expect(screen.getByRole('button', { name: '筛选内容类型' }).textContent).toContain('全部');
  });

  it('returns to the active collection view after a remount', () => {
    const collectedArticle = article({ id: 'article_collected', title: '合集内文章' });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: now,
      updatedAt: now,
    };
    const options = {
      collections: [collection],
      collectionMembers: [
        {
          collectionId: collection.id,
          member: { kind: 'article' as const, id: collectedArticle.id },
          addedAt: now,
        },
      ],
    };
    renderLibrary([collectedArticle], options);

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));
    expect(screen.getByRole('button', { name: '返回全部' })).toBeTruthy();

    // 模拟在合集内进入文章后返回：卸载后再次进入阅读库应仍停留在该合集
    cleanup();
    renderLibrary([collectedArticle], options);

    expect(screen.getByRole('button', { name: '返回全部' })).toBeTruthy();
    expect(screen.getByText('研究合集')).toBeTruthy();
  });

  it('marks collection drill direction when entering and returning', () => {
    const collectedArticle = article({ id: 'article_collected', title: '合集内文章' });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: now,
      updatedAt: now,
    };
    renderLibrary([collectedArticle], {
      collections: [collection],
      collectionMembers: [
        {
          collectionId: collection.id,
          member: { kind: 'article', id: collectedArticle.id },
          addedAt: now,
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));

    expect(document.querySelector('.library-home-body')?.getAttribute('data-list-transition')).toBe(
      'forward',
    );

    fireEvent.click(screen.getByRole('button', { name: '返回全部' }));

    expect(document.querySelector('.library-home-body')?.getAttribute('data-list-transition')).toBe(
      'backward',
    );
  });

  it('pins articles from the card menu', async () => {
    const setLibraryPin = vi.fn().mockResolvedValue({
      type: 'library-pin',
      pin: {
        targetKind: 'article',
        targetId: 'article_1',
        pinnedAt: '2026-06-21T00:00:00.000Z',
      },
      pinned: true,
    });
    vi.stubGlobal('yomitomoDesktop', { setLibraryPin });
    renderLibrary([article({ title: '待置顶文章' })]);

    fireEvent.click(screen.getByRole('button', { name: '更多操作：待置顶文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }));

    await waitFor(() =>
      expect(setLibraryPin).toHaveBeenCalledWith({
        target: { kind: 'article', id: 'article_1' },
        pinned: true,
      }),
    );
  });

  it('shows collections for collected members in all scope and flattens them in type scope', async () => {
    const collectedArticle = article({
      id: 'article_collected',
      title: '合集内文章',
      updatedAt: '2026-05-10T12:00:00.000Z',
    });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };
    const member: CollectionMember = {
      collectionId: collection.id,
      member: { kind: 'article', id: collectedArticle.id },
      addedAt: '2026-05-10T12:00:00.000Z',
    };
    renderLibrary([collectedArticle], {
      collections: [collection],
      collectionMembers: [member],
    });

    fireEvent.change(screen.getByLabelText('搜索文章、合集、作者或来源'), {
      target: { value: '合集内文章' },
    });

    expect(screen.getByText('研究合集')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文章：合集内文章' })).toBeNull();

    await selectLibraryType(/网页文章/);

    expect(screen.getAllByText('合集内文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('研究合集')).toBeNull();
  });

  it('keeps collection search independent from the cover preview limit', () => {
    const previewArticles = Array.from({ length: 10 }, (_, index) =>
      article({
        id: `article_preview_${index}`,
        title: `预览文章 ${index}`,
      }),
    );
    const hiddenMatch = article({
      id: 'article_hidden_match',
      title: '深层命中文章',
    });
    const collection: Collection = {
      id: 'collection_1',
      name: '长期研究',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };
    const collectionMembers: CollectionMember[] = [
      ...previewArticles.map((item, index) => ({
        collectionId: collection.id,
        member: { kind: 'article' as const, id: item.id },
        addedAt: `2026-05-${20 - index}T12:00:00.000Z`,
      })),
      {
        collectionId: collection.id,
        member: { kind: 'article', id: hiddenMatch.id },
        addedAt: '2026-05-01T12:00:00.000Z',
      },
    ];
    renderLibrary([...previewArticles, hiddenMatch], {
      collections: [collection],
      collectionMembers,
    });

    fireEvent.change(screen.getByLabelText('搜索文章、合集、作者或来源'), {
      target: { value: '深层命中' },
    });

    expect(screen.getByRole('button', { name: '打开合集：长期研究' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文章：深层命中文章' })).toBeNull();
  });

  it('clears the main library search through the dissolve clear affordance', async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    document.documentElement.dataset.themeTone = 'dark';
    let frameTime = 0;
    const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => frameTime);
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) =>
      window.setTimeout(() => {
        frameTime += 1000;
        callback(frameTime);
      }, 0),
    );
    const cancelAnimationFrameMock = vi.fn((handle: number) => window.clearTimeout(handle));
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
    window.requestAnimationFrame = requestAnimationFrameMock;
    window.cancelAnimationFrame = cancelAnimationFrameMock;
    renderLibrary([
      article({ id: 'alpha_article', title: 'Alpha 阅读' }),
      article({ id: 'beta_article', title: 'Beta 阅读' }),
    ]);

    const input = screen.getByLabelText('搜索文章、合集、作者或来源') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: 'Beta' } });

    expect(screen.queryByRole('button', { name: '打开文章：Alpha 阅读' })).toBeNull();
    expect(screen.getByRole('button', { name: '打开文章：Beta 阅读' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    const clearShell = document.querySelector('.library-search-input-clear');
    expect(input.value).toBe('');
    expect(clearShell?.classList.contains('is-clearing')).toBe(true);
    expect(clearShell?.getAttribute('data-clear-tone')).toBe('dark');
    expect(clearShell?.querySelector('.t-clear-mirror')?.textContent).toBe('Beta');
    expect(screen.getByRole('button', { name: '打开文章：Alpha 阅读' })).toBeTruthy();

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await vi.runOnlyPendingTimersAsync();
    });

    expect(document.activeElement).toBe(input);
    expect(clearShell?.classList.contains('is-clearing')).toBe(false);
    performanceNow.mockRestore();
  });

  it('keeps production-minified clear durations in milliseconds', async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    let frameTime = 0;
    const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => frameTime);
    const frameTimes = [16, 1000, 1016];
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) =>
      window.setTimeout(() => {
        frameTime = frameTimes.shift() ?? frameTime + 16;
        callback(frameTime);
      }, 0),
    );
    const cancelAnimationFrameMock = vi.fn((handle: number) => window.clearTimeout(handle));
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
    window.requestAnimationFrame = requestAnimationFrameMock;
    window.cancelAnimationFrame = cancelAnimationFrameMock;
    renderLibrary([
      article({ id: 'alpha_article', title: 'Alpha 阅读' }),
      article({ id: 'beta_article', title: 'Beta 阅读' }),
    ]);

    const input = screen.getByLabelText('搜索文章、合集、作者或来源') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Beta' } });
    const clearShell = document.querySelector<HTMLElement>('.library-search-input-clear');
    clearShell?.style.setProperty('--clear-dur', '1s');
    clearShell?.style.setProperty('--clear-out-dur', '.4s');
    clearShell?.style.setProperty('--clear-in-dur', '.4s');
    clearShell?.style.setProperty('--glow-delay', '50ms');
    clearShell?.style.setProperty('--clear-in-fly', '12px');

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(clearShell?.classList.contains('is-clearing')).toBe(true);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await vi.runOnlyPendingTimersAsync();
    });

    expect(clearShell?.classList.contains('is-clearing')).toBe(false);
    performanceNow.mockRestore();
  });

  it('clears collection list search immediately when reduced motion is requested', () => {
    stubReducedMotion(true);
    const firstArticle = article({
      id: 'collection_first',
      title: '合集文章一',
    });
    const secondArticle = article({
      id: 'collection_second',
      title: '合集文章二',
    });
    const collection: Collection = {
      id: 'collection_1',
      name: '长期研究',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };
    const collectionMembers: CollectionMember[] = [
      {
        collectionId: collection.id,
        member: { kind: 'article', id: firstArticle.id },
        addedAt: '2026-05-10T12:00:00.000Z',
      },
      {
        collectionId: collection.id,
        member: { kind: 'article', id: secondArticle.id },
        addedAt: '2026-05-09T12:00:00.000Z',
      },
    ];
    renderLibrary([firstArticle, secondArticle], {
      collections: [collection],
      collectionMembers,
    });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：长期研究' }));
    const input = screen.getByLabelText('搜索文章、合集、作者或来源') as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBe('搜索合集内文章…');

    input.focus();
    fireEvent.change(input, { target: { value: '文章一' } });

    expect(screen.getByRole('button', { name: '打开文章：合集文章一' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文章：合集文章二' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    expect(input.value).toBe('');
    expect(document.querySelector('.library-search-input-clear.is-clearing')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('button', { name: '打开文章：合集文章一' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开文章：合集文章二' })).toBeTruthy();
  });

  it('filters the main library list to collections only', async () => {
    const collection: Collection = {
      id: 'collection_1',
      name: '只看合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };
    renderLibrary([article({ title: '普通文章' })], { collections: [collection] });

    await selectLibraryType(/^合集$/);

    expect(screen.getByRole('button', { name: '打开合集：只看合集' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文章：普通文章' })).toBeNull();
    expect(screen.getByText('共 1 个合集')).toBeTruthy();
  });

  it('opens a collection and removes a member from its article menu', async () => {
    const removeCollectionMember = vi.fn().mockResolvedValue({
      type: 'collection-members',
      collectionId: 'collection_1',
      members: [],
    });
    vi.stubGlobal('yomitomoDesktop', { removeCollectionMember });
    const collectedArticle = article({
      id: 'article_collected',
      title: '合集内文章',
      updatedAt: '2026-05-10T12:00:00.000Z',
    });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };

    renderLibrary([collectedArticle], {
      collections: [collection],
      collectionMembers: [
        {
          collectionId: collection.id,
          member: { kind: 'article', id: collectedArticle.id },
          addedAt: '2026-05-10T12:00:00.000Z',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));
    expect(screen.getByRole('button', { name: '返回全部' }).textContent).toContain('阅读库');
    fireEvent.click(screen.getByRole('button', { name: '更多操作：合集内文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '从合集中移除' }));

    await waitFor(() =>
      expect(removeCollectionMember).toHaveBeenCalledWith({
        collectionId: collection.id,
        member: { kind: 'article', id: collectedArticle.id },
      }),
    );
  });

  it('orders pinned collection members before unpinned members without a pinned heading', () => {
    const pinnedArticle = article({
      id: 'article_pinned',
      title: '置顶合集文章',
      createdAt: '2026-05-01T12:00:00.000Z',
    });
    const unpinnedArticle = article({
      id: 'article_unpinned',
      title: '未置顶合集文章',
      createdAt: '2026-05-02T12:00:00.000Z',
    });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };

    renderLibrary([unpinnedArticle, pinnedArticle], {
      collections: [collection],
      collectionMembers: [
        {
          collectionId: collection.id,
          member: { kind: 'article', id: unpinnedArticle.id },
          addedAt: '2026-05-20T12:00:00.000Z',
        },
        {
          collectionId: collection.id,
          member: { kind: 'article', id: pinnedArticle.id },
          addedAt: '2026-05-10T12:00:00.000Z',
        },
      ],
      pins: [
        {
          targetKind: 'article',
          targetId: pinnedArticle.id,
          pinnedAt: '2026-06-20T12:00:00.000Z',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));

    expect(screen.queryByRole('heading', { name: '置顶' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 3 }).map((item) => item.textContent)).toEqual([
      '置顶合集文章',
      '未置顶合集文章',
    ]);
  });

  it('adds WeRead books to a collection from the picker', async () => {
    const addCollectionMembers = vi.fn().mockResolvedValue({
      type: 'collection-members',
      collectionId: 'collection_1',
      members: [],
    });
    const state = {
      settings: { configured: true, openMethod: 'deeplink' as const },
      books: [
        {
          bookId: 'weread_1',
          title: '微信读书标题',
          author: '微信作者',
          reviewCount: 0,
          noteCount: 2,
          bookmarkCount: 0,
          readingProgress: 12,
          updatedAt: now,
        },
      ],
    };
    vi.stubGlobal('yomitomoDesktop', {
      addCollectionMembers,
      getWeReadState: vi.fn().mockResolvedValue(state),
      syncWeRead: vi.fn().mockResolvedValue(state),
    });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };

    renderLibrary([], { collections: [collection] });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));
    fireEvent.click(screen.getByRole('button', { name: '添加内容' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '添加已有文章' }));
    const picker = document.querySelector<HTMLElement>('.library-collection-picker-dialog');
    expect(picker).toBeTruthy();
    await within(picker!).findAllByText('微信读书标题');
    fireEvent.click(within(picker!).getByRole('button', { name: '添加到此合集：微信读书标题' }));
    fireEvent.click(within(picker!).getByRole('button', { name: '加入 1 项' }));

    await waitFor(() =>
      expect(addCollectionMembers).toHaveBeenCalledWith({
        collectionId: collection.id,
        members: [{ kind: 'weread', id: 'weread_1' }],
      }),
    );
  });

  it('collapses a picker item while it is being dragged into the pending list', async () => {
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };
    renderLibrary([article({ id: 'article_drag_picker', title: '待拖入合集' })], {
      collections: [collection],
    });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));
    fireEvent.click(screen.getByRole('button', { name: '添加内容' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '添加已有文章' }));
    const picker = document.querySelector<HTMLElement>('.library-collection-picker-dialog');
    expect(picker).toBeTruthy();
    const item = within(picker!)
      .getAllByText('待拖入合集')[1]
      .closest('.library-collection-picker-item') as HTMLElement;
    expect(item).toBeTruthy();
    const dragHandle = item.querySelector<HTMLElement>('.library-collection-picker-drag-handle')!;
    expect(dragHandle).toBeTruthy();

    fireEvent.pointerDown(dragHandle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });

    await waitFor(() => expect(item.classList.contains('is-dragging')).toBe(true));

    fireEvent.pointerUp(dragHandle, { pointerId: 1, clientX: 10, clientY: 10 });

    await waitFor(() => expect(item.classList.contains('is-dragging')).toBe(false));
  });

  it('adds an article to a collection by dragging it onto the collection card', async () => {
    const addCollectionMembers = vi.fn().mockResolvedValue({
      type: 'collection-members',
      collectionId: 'collection_1',
      members: [],
    });
    vi.stubGlobal('yomitomoDesktop', { addCollectionMembers });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };
    renderLibrary([article({ id: 'article_drag', title: '可拖文章' })], {
      collections: [collection],
    });
    const articleCard = screen
      .getByRole('button', { name: '打开文章：可拖文章' })
      .closest('article');
    const collectionCard = screen
      .getByRole('button', { name: '打开合集：研究合集' })
      .closest('article');
    const dragData = new Map<string, string>();
    const dataTransfer = {
      dropEffect: '',
      effectAllowed: '',
      getData: vi.fn((type: string) => dragData.get(type) || ''),
      setData: vi.fn((type: string, value: string) => dragData.set(type, value)),
    };

    fireEvent.dragStart(articleCard!, { dataTransfer });
    fireEvent.dragOver(collectionCard!, { dataTransfer });
    fireEvent.drop(collectionCard!, { dataTransfer });

    await waitFor(() =>
      expect(addCollectionMembers).toHaveBeenCalledWith({
        collectionId: collection.id,
        members: [{ kind: 'article', id: 'article_drag' }],
      }),
    );
  });

  it('plays the shared delete sound after confirming a reading item delete', async () => {
    const onDeleteArticle = vi.fn().mockResolvedValue(undefined);
    renderLibrary([article({ title: '待删除文章' })], {
      onDeleteArticle,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.42,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '更多操作：待删除文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除阅读材料：待删除文章' }));
    fireEvent.click(screen.getByRole('button', { name: '删除材料' }));

    await waitFor(() => expect(onDeleteArticle).toHaveBeenCalledWith('article_1'));
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.delete_item', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.42,
    });
  });

  it('restores and saves the library page size preference', async () => {
    const onSaveSettings = vi.fn();
    const articles = Array.from({ length: 20 }, (_, index) =>
      article({
        id: `article_${index + 1}`,
        title: `文章 ${index + 1}`,
        createdAt: `2026-05-09T12:${String(index + 1).padStart(2, '0')}:00.000Z`,
      }),
    );

    renderLibrary(articles, {
      onSaveSettings,
      settings: { libraryPageSize: 18, themeId: 'ink-paper' },
    });

    expect(document.querySelectorAll('.library-article-list-item h3')).toHaveLength(18);

    fireEvent.click(screen.getByRole('combobox', { name: '每页显示数量' }));
    const pageSizeOption = await screen.findByRole('option', { name: '每页 24 项' });
    fireEvent.pointerDown(pageSizeOption, { pointerType: 'mouse' });
    fireEvent.click(pageSizeOption);

    expect(onSaveSettings).toHaveBeenCalledWith({
      libraryPageSize: 24,
      themeId: 'ink-paper',
    });
  });

  it('marks pagination direction when moving between library pages', () => {
    const articles = Array.from({ length: 14 }, (_, index) =>
      article({
        id: `paged_article_${index + 1}`,
        title: `分页文章 ${index + 1}`,
        createdAt: `2026-05-09T12:${String(index + 1).padStart(2, '0')}:00.000Z`,
      }),
    );
    const { container } = renderLibrary(articles);

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    expect(
      container.querySelector('.library-source-panel')?.getAttribute('data-page-transition'),
    ).toBe('forward');

    fireEvent.click(screen.getByRole('button', { name: '上一页' }));

    expect(
      container.querySelector('.library-source-panel')?.getAttribute('data-page-transition'),
    ).toBe('backward');

    fireEvent.change(screen.getByLabelText('搜索文章、合集、作者或来源'), {
      target: { value: '分页文章 1' },
    });

    expect(
      container.querySelector('.library-source-panel')?.getAttribute('data-page-transition'),
    ).toBe('none');
    expect(
      container.querySelector('.library-home-body')?.getAttribute('data-list-transition'),
    ).toBe('none');
  });

  it('searches source metadata without reading status filters', () => {
    renderLibrary([
      article({ id: 'article_new', title: '新文章', siteName: 'Acme Daily' }),
      article({
        id: 'article_progress',
        title: '批注文章',
        annotations: [annotation('annotation_progress')],
      }),
      completedArticle(),
    ]);

    expect(screen.queryByRole('button', { name: '已读完' })).toBeNull();
    fireEvent.change(screen.getByLabelText('搜索文章、合集、作者或来源'), {
      target: { value: 'acme' },
    });
    expect(screen.getAllByText('新文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('批注文章')).toBeNull();
  });

  it('renders the article domain without site icons', () => {
    const { container } = renderLibrary([
      article({
        byline: '原始作者',
        annotations: [
          annotationWithPublishedDistillation('domain_note'),
          annotationWithPublishedDistillation('domain_mark'),
        ],
        canonicalUrl: 'https://nooneshappy.com/posts/1',
        siteIconUrl: 'https://favicon.im/nooneshappy.com',
        siteName: '站点名称不显示',
        title: '域名文章',
        readingProgress: {
          pageIndex: 4,
          pageCount: 10,
          progress: 0.4,
          updatedAt: now,
        },
      }),
    ]);

    expect(screen.queryByText('原始作者')).toBeNull();
    expect(screen.getAllByText('nooneshappy.com').length).toBeGreaterThan(1);
    const stats = screen.getByLabelText('2 条划线 · 2 条沉淀');
    expect(stats).toBeTruthy();
    expect(stats.getAttribute('title')).toBeNull();
    expect(
      Array.from(stats.querySelectorAll('.library-count-stat')).map((item) => item.textContent),
    ).toEqual(['2', '2']);
    expect(container.querySelector('.library-web-item-cover .web-cover-domain')?.textContent).toBe(
      'nooneshappy.com',
    );
    expect(container.querySelector('.library-web-item-cover .library-cover-progress')).toBeTruthy();
    expect(
      container
        .querySelector<HTMLElement>('.library-web-item-cover .library-cover-progress')
        ?.style.getPropertyValue('--ebook-progress'),
    ).toBe('40%');
    expect(screen.getAllByText('05/09').length).toBeGreaterThan(0);
    expect(
      container.querySelector('.library-web-item-meta .library-source-badge')?.textContent,
    ).toBe('网页');
    expect(screen.queryByText('站点名称不显示')).toBeNull();
    expect(container.querySelector('.library-site-icon')).toBeNull();
    expect(screen.queryByText(/进行中|已读完|约 1 分钟|最近阅读/)).toBeNull();
  });

  it('renders ebooks as list rows with cover progress', async () => {
    const coverUrl = 'data:image/jpeg;base64,ZmFrZS1jb3Zlcg==';
    const getArticleCover = vi.fn().mockResolvedValue(coverUrl);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { getArticleCover },
    });
    const { container } = renderLibrary([
      article({
        id: 'ebook_1',
        url: 'ebook://ebook_1',
        canonicalUrl: 'ebook://ebook_1',
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
          pageIndex: 4,
          pageCount: 10,
          progress: 0.4,
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
    await waitFor(() => expect(getArticleCover).toHaveBeenCalledWith('ebook_1'));
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
      getWeReadState: vi.fn().mockResolvedValue(state),
      syncWeRead: vi.fn().mockResolvedValue(state),
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
      getWeReadState: vi.fn().mockResolvedValue(state),
      syncWeRead: vi.fn().mockResolvedValue(state),
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
      getWeReadState: vi.fn().mockResolvedValue(state),
      syncWeRead,
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
      getWeReadState: vi.fn().mockResolvedValue(initialState),
      onWeReadStateUpdated: vi.fn((callback) => {
        emitWeReadState = callback;
        return vi.fn();
      }),
      syncWeRead,
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
              author: 'ai',
              content: '助手想法',
              agentId: 'agent_1',
              agentNickname: '行开心',
              createdAt: '2026-05-09T12:03:00.000Z',
            },
          ],
          updatedAt: '2026-05-09T12:03:00.000Z',
        },
      ],
      annotationCount: 1,
      commentCount: 1,
      aiCommentCount: 1,
    });
    const updatedSummary = {
      ...articleSummary(updatedArticle),
      annotations: [],
      annotationCount: 1,
      commentCount: 1,
      aiCommentCount: 1,
    };
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
          articles={articles}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
          onDeleteArticle={vi.fn()}
          onImportEbookFile={vi.fn()}
          onImportPdfFile={vi.fn()}
          onImportArticleUrl={vi.fn()}
          onReadArticle={(articleId) => onReadArticle(articleId)}
          onSaveArticle={vi.fn()}
          onSaveArticleReadingProgress={vi.fn()}
          onUpdateArticle={vi.fn()}
        />
      );
    }

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
              author: 'user',
              content: '待删除想法',
              createdAt: '2026-05-09T12:01:00.000Z',
            },
          ],
        },
      ],
      annotationCount: 1,
      commentCount: 1,
      aiCommentCount: 0,
    });
    const updatedArticle = article({
      title: '删除同步文章',
      annotations: [{ ...annotation('annotation_1'), comments: [] }],
      annotationCount: 1,
      commentCount: 0,
      aiCommentCount: 0,
    });
    const updatedSummary = {
      ...articleSummary(updatedArticle),
      annotations: [],
      annotationCount: 1,
      commentCount: 0,
      aiCommentCount: 0,
    };
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
          articles={articles}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
          onDeleteArticle={vi.fn()}
          onImportEbookFile={vi.fn()}
          onImportPdfFile={vi.fn()}
          onImportArticleUrl={vi.fn()}
          onReadArticle={(articleId) => onReadArticle(articleId)}
          onSaveArticle={vi.fn()}
          onSaveArticleReadingProgress={vi.fn()}
          onUpdateArticle={vi.fn()}
        />
      );
    }

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
      onAnnotationDistillationCommitted: vi.fn((listener) => {
        onCommitted = listener;
        return vi.fn();
      }),
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
      settings,
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
      settings,
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
              author: 'ai',
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
    const summary = {
      ...articleSummary(fullArticle),
      aiCommentCount: 1,
      annotationCount: 1,
      commentCount: 0,
      distillationCount: 1,
    };
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
      onAnnotationDistillationCommitted: vi.fn((listener) => {
        onCommitted = listener;
        return vi.fn();
      }),
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
      annotationCount: 1,
      distillationCount: 0,
      updatedAt: '2026-05-09T12:00:00.000Z',
    });
    const publishedArticle = article({
      title: '同步沉淀文章',
      annotations: [publishedAnnotation],
      annotationCount: 1,
      distillationCount: 1,
      updatedAt: '2026-05-09T12:03:00.000Z',
    });
    const publishedSummary = {
      ...articleSummary(publishedArticle),
      annotations: [],
      annotationCount: 1,
      distillationCount: 1,
    };
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
          articles={articles}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
          onDeleteArticle={vi.fn()}
          onImportEbookFile={vi.fn()}
          onImportPdfFile={vi.fn()}
          onImportArticleUrl={vi.fn()}
          onReadArticle={(articleId) => onReadArticle(articleId)}
          onSaveArticle={vi.fn()}
          onSaveArticleReadingProgress={vi.fn()}
          onUpdateArticle={vi.fn()}
        />
      );
    }

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
        pageCount: 1000,
        pageIndex: 300,
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

  it('imports a webpage and shows duplicate article action', async () => {
    const duplicate = article({ title: '重复文章' });
    const onImportArticleUrl = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: duplicate,
    });
    renderLibrary([duplicate], { onImportArticleUrl });

    await selectLibraryType(/网页文章/);
    await openAddMenuItem('添加网页文章');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText('添加网页文章')).toBeTruthy();
    expect(screen.getByLabelText('网页地址').tagName).toBe('INPUT');
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    await waitFor(() => {
      expect(onImportArticleUrl).toHaveBeenCalledWith(
        'https://example.com/post',
        'article-import-1',
      );
    });
    expect((await screen.findAllByText('这篇文章已在阅读库')).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('progressbar', { name: '网页文章导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect(screen.getByText('已在阅读库中找到这篇文章')).toBeTruthy();
    expect(screen.getByText('无需重复导入，可以直接打开已有文章。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开已有文章' })).toBeTruthy();
    expect(screen.getByDisplayValue('重复文章')).toBeTruthy();
    expect(playAppSoundEffect).not.toHaveBeenCalled();
  });

  it('auto closes the webpage import dialog after a successful import', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const imported = article({ id: 'article_imported', title: '新导入文章' });
    const onImportArticleUrl = vi.fn().mockResolvedValue({
      status: 'imported',
      article: imported,
    });
    renderLibrary([], {
      onImportArticleUrl,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.6,
      },
    });

    await selectLibraryType(/网页文章/);
    await openAddMenuItem('添加网页文章');
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    await waitFor(() => {
      expect(onImportArticleUrl).toHaveBeenCalledWith(
        'https://example.com/post',
        'article-import-1',
      );
    });
    expect((await screen.findAllByText('已添加到阅读库')).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('progressbar', { name: '网页文章导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect(screen.getByDisplayValue('新导入文章')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文章' })).toBeNull();
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.import_success_single', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.6,
    });
    expect(hasScheduledDelay(setTimeoutSpy, 900)).toBe(true);
    expect(hasScheduledDelay(setTimeoutSpy, 1200)).toBe(false);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 });
  });

  it('delays webpage import cancellation and ignores late results', async () => {
    const imported = article({ id: 'article_late', title: '晚到文章' });
    const deferred = deferredImportResult();
    const onImportArticleUrl = vi.fn().mockReturnValue(deferred.promise);
    const onCancelArticleImport = vi.fn();
    renderLibrary([], { onImportArticleUrl, onCancelArticleImport });

    await selectLibraryType(/网页文章/);
    await openAddMenuItem('添加网页文章');
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/slow' },
    });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    expect(screen.queryByRole('button', { name: '取消解析' })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    fireEvent.click(screen.getByRole('button', { name: '取消解析' }));
    expect(onCancelArticleImport).toHaveBeenCalledWith('article-import-1');
    expect(screen.getAllByText('已取消解析').length).toBeGreaterThan(0);

    await act(async () => {
      deferred.resolve({ status: 'imported', article: imported });
      await Promise.resolve();
    });
    await flushMicrotasks();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/slow')).toBeTruthy();
    expect(screen.queryByDisplayValue('晚到文章')).toBeNull();
  });

  it('shows webpage import errors inside the dialog', async () => {
    const onImportArticleUrl = vi.fn().mockRejectedValue(new Error('fetch failed'));
    renderLibrary([], { onImportArticleUrl });

    await selectLibraryType(/网页文章/);
    await openAddMenuItem('添加网页文章');
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    expect(await screen.findByText('解析失败')).toBeTruthy();
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.queryByText('无法访问这个网页，请确认链接可打开后再试')).toBeNull();
    expect(screen.queryByText(/fetch failed/)).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('opens ebook import dialog from the ebook type action', async () => {
    renderLibrary([]);

    await selectLibraryType(/电子书/);
    await openAddMenuItem('电子书文件');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('添加电子书')).toBeTruthy();
    expect(
      within(dialog).getByText('可批量导入 · EPUB/AZW3/MOBI · 单本最高 80MB · 最多 10 本'),
    ).toBeTruthy();
    expect(within(dialog).getByText('文件仅保存在本机，不会上传到任何服务器。')).toBeTruthy();
    expect(within(dialog).getByText('拖入电子书文件，或点击选择')).toBeTruthy();
  });

  it('opens PDF import dialog from an app menu request', async () => {
    renderLibrary([], { menuRequest: { command: 'import-pdf', id: 1 } });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('添加 PDF 文档')).toBeTruthy();
    expect(within(dialog).getByText('文件仅保存在本机，不会上传到任何服务器。')).toBeTruthy();
  });

  it('renders the first-use empty state with import entries', () => {
    renderLibrary([]);

    expect(screen.getByText('阅读库还空着')).toBeTruthy();
    expect(screen.getByText('粘贴网页链接')).toBeTruthy();
    expect(screen.getByText('导入电子书')).toBeTruthy();
    expect(screen.getByText('导入 PDF')).toBeTruthy();
    expect(screen.getByText('连接微信读书')).toBeTruthy();
  });

  it('opens the web article import dialog from the empty-state entry', async () => {
    renderLibrary([]);

    fireEvent.click(screen.getByText('粘贴网页链接'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('添加网页文章')).toBeTruthy();
    expect(within(dialog).queryByText('文件仅保存在本机，不会上传到任何服务器。')).toBeNull();
  });

  it('routes the unconfigured WeRead entry to data source settings', () => {
    const onOpenDataSources = vi.fn();
    renderLibrary([], { onOpenDataSources });

    const wereadEntry = screen.getByText('连接微信读书').closest('button');
    expect((wereadEntry as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(wereadEntry!);
    expect(onOpenDataSources).toHaveBeenCalledTimes(1);
  });

  it('imports an ebook file with progress feedback', async () => {
    const imported = article({
      id: 'ebook_imported',
      url: 'ebook://ebook_imported',
      canonicalUrl: 'ebook://ebook_imported',
      sourceType: 'ebook',
      title: '导入的电子书示例',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'book.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const onImportEbookFile = vi.fn(async (file: File, onProgress?: (progress: number) => void) => {
      onProgress?.(42);
      return { status: 'imported' as const, article: imported };
    });
    const { container } = renderLibrary([], {
      onImportEbookFile,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.7,
      },
    });

    await selectLibraryType(/电子书/);
    await openAddMenuItem('电子书文件');
    const file = fileWithSize('book.epub', 1024);
    selectImportFile(container, 'library-ebook-file', file);

    await waitFor(() => expect(onImportEbookFile).toHaveBeenCalledWith(file, expect.any(Function)));
    expect(
      screen.getByRole('progressbar', { name: '电子书导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(screen.getByText('导入的电子书示例')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开电子书' })).toBeNull();
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.import_success_single', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.7,
    });
  });

  it('auto closes successful ebook imports after the shorter celebration delay', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const imported = article({
      id: 'ebook_autoclose',
      url: 'ebook://ebook_autoclose',
      canonicalUrl: 'ebook://ebook_autoclose',
      sourceType: 'ebook',
      title: '自动关闭电子书',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'autoclose.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const onImportEbookFile = vi.fn().mockResolvedValue({
      status: 'imported' as const,
      article: imported,
    });
    const { container } = renderLibrary([], { onImportEbookFile });

    await selectLibraryType(/电子书/);
    await openAddMenuItem('电子书文件');
    selectImportFile(container, 'library-ebook-file', fileWithSize('autoclose.epub', 1024));

    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(hasScheduledDelay(setTimeoutSpy, 900)).toBe(true);
    expect(hasScheduledDelay(setTimeoutSpy, 1600)).toBe(false);
  });

  it('imports multiple ebook files sequentially', async () => {
    const importedOne = article({
      id: 'ebook_imported_one',
      url: 'ebook://ebook_imported_one',
      canonicalUrl: 'ebook://ebook_imported_one',
      sourceType: 'ebook',
      title: '第一本电子书',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'one.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const importedTwo = article({
      id: 'ebook_imported_two',
      url: 'ebook://ebook_imported_two',
      canonicalUrl: 'ebook://ebook_imported_two',
      sourceType: 'ebook',
      title: '第二本电子书',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'two.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const calls: string[] = [];
    const onImportEbookFile = vi.fn(async (file: File, onProgress?: (progress: number) => void) => {
      calls.push(file.name);
      onProgress?.(100);
      return {
        status: 'imported' as const,
        article: file.name === 'one.epub' ? importedOne : importedTwo,
      };
    });
    const { container } = renderLibrary([], {
      onImportEbookFile,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.4,
      },
    });

    await selectLibraryType(/电子书/);
    await openAddMenuItem('电子书文件');
    const one = fileWithSize('one.epub', 1024);
    const two = fileWithSize('two.epub', 1024);
    selectImportFiles(container, 'library-ebook-file', [one, two]);

    await waitFor(() => expect(onImportEbookFile).toHaveBeenCalledTimes(2));
    expect(calls).toEqual(['one.epub', 'two.epub']);
    expect(screen.getByText('第一本电子书')).toBeTruthy();
    expect(screen.getByText('第二本电子书')).toBeTruthy();
    expect((await screen.findAllByText('已导入 2 个文件')).length).toBeGreaterThan(0);
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.import_success_multiple', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.4,
    });
  });

  it('opens an existing ebook from the duplicate import state', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const duplicate = article({
      id: 'ebook_duplicate',
      url: 'ebook://ebook_duplicate',
      canonicalUrl: 'ebook://ebook_duplicate',
      sourceType: 'ebook',
      title: '已有电子书',
      contentHtml: '<p>书正文</p>',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'duplicate.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const onImportEbookFile = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: duplicate,
    });
    const onReadArticle = vi.fn().mockResolvedValue(duplicate);
    const { container } = renderLibrary([articleSummary(duplicate)], {
      onImportEbookFile,
      onReadArticle,
    });

    await selectLibraryType(/电子书/);
    await openAddMenuItem('电子书文件');
    selectImportFile(container, 'library-ebook-file', fileWithSize('duplicate.epub', 1024));

    expect((await screen.findAllByText('这本电子书已在阅读库')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '打开已有电子书' }));

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledWith('ebook_duplicate'));
  });

  it('validates ebook file extension and size before importing', async () => {
    const onImportEbookFile = vi.fn();
    const { container } = renderLibrary([], { onImportEbookFile });

    await selectLibraryType(/电子书/);
    await openAddMenuItem('电子书文件');
    selectImportFile(container, 'library-ebook-file', fileWithSize('notes.txt', 1024));

    expect((await screen.findAllByText('请选择 EPUB、AZW3 或 MOBI 文件')).length).toBeGreaterThan(
      0,
    );
    selectImportFile(
      container,
      'library-ebook-file',
      fileWithSize('large.azw3', 80 * 1024 * 1024 + 1),
    );

    expect((await screen.findAllByText('电子书文件不能超过 80MB')).length).toBeGreaterThan(0);
    expect(onImportEbookFile).not.toHaveBeenCalled();
  });

  it('imports a PDF file with progress feedback', async () => {
    const imported = article({
      id: 'pdf_imported',
      url: 'pdf:pdf_imported',
      canonicalUrl: 'pdf:hash_imported',
      sourceType: 'pdf',
      title: '导入的 PDF 示例',
      siteName: 'PDF',
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'paper.pdf',
          fileSize: 2048,
          pageCount: 12,
        },
      },
    });
    const onImportPdfFile = vi.fn(async (file: File, onProgress?: (progress: number) => void) => {
      onProgress?.(64);
      return { status: 'imported' as const, article: imported };
    });
    const { container } = renderLibrary([], { onImportPdfFile });

    await selectLibraryType(/PDF/);
    await openAddMenuItem('PDF 文档');
    const file = fileWithSize('paper.pdf', 2048);
    selectImportFile(container, 'library-pdf-file', file);

    await waitFor(() => expect(onImportPdfFile).toHaveBeenCalledWith(file, expect.any(Function)));
    expect(
      screen.getByRole('progressbar', { name: 'PDF 导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(screen.getByText('导入的 PDF 示例')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开 PDF' })).toBeNull();
  });

  it('auto closes successful PDF imports after the shorter file delay', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const imported = article({
      id: 'pdf_autoclose',
      url: 'pdf:pdf_autoclose',
      canonicalUrl: 'pdf:hash_autoclose',
      sourceType: 'pdf',
      title: '自动关闭 PDF',
      siteName: 'PDF',
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'autoclose.pdf',
          fileSize: 2048,
          pageCount: 12,
        },
      },
    });
    const onImportPdfFile = vi.fn().mockResolvedValue({
      status: 'imported' as const,
      article: imported,
    });
    const { container } = renderLibrary([], { onImportPdfFile });

    await selectLibraryType(/PDF/);
    await openAddMenuItem('PDF 文档');
    selectImportFile(container, 'library-pdf-file', fileWithSize('autoclose.pdf', 2048));

    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(hasScheduledDelay(setTimeoutSpy, 900)).toBe(true);
    expect(hasScheduledDelay(setTimeoutSpy, 1800)).toBe(false);
  });

  it('opens an existing PDF from the duplicate import state', async () => {
    const duplicate = article({
      id: 'pdf_duplicate',
      url: 'pdf:pdf_duplicate',
      canonicalUrl: 'pdf:hash_duplicate',
      sourceType: 'pdf',
      title: '已有 PDF',
      siteName: 'PDF',
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'duplicate.pdf',
          fileSize: 2048,
          pageCount: 12,
        },
      },
    });
    const onImportPdfFile = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: duplicate,
    });
    const onReadArticle = vi.fn().mockResolvedValue(duplicate);
    const { container } = renderLibrary([articleSummary(duplicate)], {
      onImportPdfFile,
      onReadArticle,
    });

    await selectLibraryType(/PDF/);
    await openAddMenuItem('PDF 文档');
    selectImportFile(container, 'library-pdf-file', fileWithSize('duplicate.pdf', 2048));

    expect((await screen.findAllByText('这份 PDF 已在阅读库')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '打开已有 PDF' }));

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledWith('pdf_duplicate'));
  });

  it('validates PDF file extension and size before importing', async () => {
    const onImportPdfFile = vi.fn();
    const { container } = renderLibrary([], { onImportPdfFile });

    await selectLibraryType(/PDF/);
    await openAddMenuItem('PDF 文档');
    selectImportFile(container, 'library-pdf-file', fileWithSize('book.epub', 1024));

    expect((await screen.findAllByText('请选择 PDF 文件')).length).toBeGreaterThan(0);
    selectImportFile(
      container,
      'library-pdf-file',
      fileWithSize('large.pdf', 120 * 1024 * 1024 + 1),
    );

    expect((await screen.findAllByText('PDF 文件不能超过 120MB')).length).toBeGreaterThan(0);
    expect(onImportPdfFile).not.toHaveBeenCalled();
  });
});
