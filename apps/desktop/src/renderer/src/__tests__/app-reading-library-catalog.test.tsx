// @vitest-environment jsdom

import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Collection } from '@yomitomo/shared';
import type { LibraryCatalogListInput, LibraryCatalogListResult } from '../../../ipc-contract';
import {
  article,
  articleSummary,
  now,
  renderLibrary,
  selectLibraryType,
} from './app-reading-library-test-support';

describe('ReadingLibrary catalog', () => {
  it('uses the paged catalog as the mixed library fact source', async () => {
    const listLibraryCatalog = vi.fn(
      async (input: LibraryCatalogListInput): Promise<LibraryCatalogListResult> => {
        const remoteArticle = articleSummary(
          article({
            id: `remote_${input.page}`,
            title: `远程目录第 ${input.page} 页`,
          }),
        );
        return {
          entities: [
            {
              kind: 'item',
              source: 'article',
              sortTime: remoteArticle.createdAt,
              pinned: false,
              article: remoteArticle,
            },
          ],
          itemCounts: { web: 13, ebook: 0, pdf: 0, text: 0, weread: 0 },
          page: input.page || 1,
          pageSize: input.pageSize || 12,
          query: input.query || '',
          totalCount: 13,
          unfilteredCount: 13,
        };
      },
    );
    vi.stubGlobal('yomitomoDesktop', {
      library: { catalog: { list: listLibraryCatalog } },
      weRead: {
        getState: vi.fn(async () => ({
          settings: { configured: false, openMethod: 'deeplink' },
          books: [],
        })),
      },
    });

    renderLibrary([]);

    await screen.findByRole('heading', { name: '远程目录第 1 页' });
    expect(listLibraryCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: { kind: 'library' },
        page: 1,
        pageSize: 12,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await screen.findByRole('heading', { name: '远程目录第 2 页' });
    expect(listLibraryCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 12 }),
    );
  });

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
        pdf: {
          metadata: {
            format: 'pdf',
            fileName: 'newer.pdf',
            fileSize: 1,
            pageCount: 1,
          },
        },
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
      weRead: {
        getState: vi.fn().mockResolvedValue(state),
        sync: vi.fn().mockResolvedValue(state),
      },
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
          pdf: {
            metadata: {
              format: 'pdf',
              fileName: 'document.pdf',
              fileSize: 1,
              pageCount: 1,
            },
          },
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
    const view = renderLibrary(articles);

    fireEvent.change(screen.getByLabelText('搜索文章、合集、作者或来源'), {
      target: { value: '关键字' },
    });
    await selectLibraryType(/网页文章/);
    expect(screen.getByRole('button', { name: '移除网页文章' })).toBeTruthy();

    view.remountLibrary();

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
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'PDF' }));
    expect(screen.getByRole('button', { name: '移除网页文章' })).toBeTruthy();

    // 选满最后一个类型后应回退到「全部」
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '文本' }));

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
    const view = renderLibrary([collectedArticle], options);

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));
    expect(screen.getByRole('button', { name: '返回全部' })).toBeTruthy();

    view.remountLibrary();

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
});
