// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Collection, CollectionMember } from '@yomitomo/shared';
import {
  annotation,
  annotationWithPublishedDistillation,
  article,
  completedArticle,
  now,
  appToast,
  playAppSoundEffect,
  renderLibrary,
  selectLibraryType,
  stubReducedMotion,
} from './app-reading-library-test-support';

describe('ReadingLibrary actions', () => {
  it('reports unavailable local content without opening the reader', async () => {
    const onReadArticle = vi.fn().mockRejectedValue(new Error('source payload invalid'));
    renderLibrary([article({ title: '损坏电子书' })], { onReadArticle });

    fireEvent.click(screen.getByRole('button', { name: '打开文章：损坏电子书' }));

    await waitFor(() =>
      expect(appToast.error).toHaveBeenCalledWith('阅读内容不可用，本地来源数据可能已损坏'),
    );
    expect(onReadArticle).toHaveBeenCalledWith('article_1');
    expect(screen.getByRole('button', { name: '打开文章：损坏电子书' })).toBeTruthy();
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
    renderLibrary([article({ title: '待置顶文章' })], { onSetLibraryPin: setLibraryPin });

    const moreButton = screen.getByRole('button', { name: '更多操作：待置顶文章' });
    fireEvent.click(moreButton);
    expect(moreButton.closest('.library-item-actions')?.classList.contains('is-active')).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }));

    await waitFor(() =>
      expect(setLibraryPin).toHaveBeenCalledWith({
        target: { kind: 'article', id: 'article_1' },
        pinned: true,
      }),
    );
  });

  it('shows pin errors from the collection action surface', async () => {
    const onSetLibraryPin = vi.fn().mockRejectedValue(new Error('pin write failed'));
    renderLibrary([article({ title: '置顶失败文章' })], { onSetLibraryPin });

    fireEvent.click(screen.getByRole('button', { name: '更多操作：置顶失败文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }));

    await waitFor(() =>
      expect(appToast.error).toHaveBeenCalledWith('置顶状态保存失败', {
        description: 'pin write failed',
      }),
    );
  });

  it('falls back to user-facing copy when a pin error has no message', async () => {
    const onSetLibraryPin = vi.fn().mockRejectedValue(new Error(''));
    renderLibrary([article({ title: '空错误文章' })], { onSetLibraryPin });

    fireEvent.click(screen.getByRole('button', { name: '更多操作：空错误文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }));

    await waitFor(() =>
      expect(appToast.error).toHaveBeenCalledWith('置顶状态保存失败', {
        description: '置顶状态保存失败',
      }),
    );
  });

  it('marks collection card actions active while the menu is open', () => {
    const collection: Collection = {
      id: 'collection_menu',
      name: '菜单状态合集',
      createdAt: now,
      updatedAt: now,
    };
    renderLibrary([], { collections: [collection] });

    const moreButton = screen.getByRole('button', { name: '更多操作：菜单状态合集' });
    fireEvent.click(moreButton);

    expect(moreButton.closest('.library-item-actions')?.classList.contains('is-active')).toBe(true);
    expect(screen.getByRole('menu')).toBeTruthy();
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(screen.queryByRole('button', { name: '打开文章：Alpha 阅读' })).toBeNull();
    expect(screen.getByRole('button', { name: '打开文章：Beta 阅读' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    const clearShell = document.querySelector('.library-search-input-clear');
    expect(input.value).toBe('');
    expect(clearShell?.classList.contains('is-clearing')).toBe(true);
    expect(clearShell?.getAttribute('data-clear-tone')).toBe('dark');
    expect(clearShell?.querySelector('.t-clear-mirror')?.textContent).toBe('Beta');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
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

  it('clears collection list search immediately when reduced motion is requested', async () => {
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

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '打开文章：合集文章二' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: '打开文章：合集文章一' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    expect(input.value).toBe('');
    expect(document.querySelector('.library-search-input-clear.is-clearing')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('button', { name: '打开文章：合集文章一' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: '打开文章：合集文章二' })).toBeTruthy();
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
      onRemoveCollectionMember: removeCollectionMember,
    });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));
    expect(screen.getByRole('button', { name: '返回全部' }).textContent).toContain('阅读库');
    fireEvent.click(screen.getByRole('button', { name: '更多操作：合集内文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '从合集中移除' }));

    await waitFor(() =>
      expect(removeCollectionMember).toHaveBeenCalledWith(collection.id, {
        kind: 'article',
        id: collectedArticle.id,
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
      weRead: {
        getState: vi.fn().mockResolvedValue(state),
        sync: vi.fn().mockResolvedValue(state),
      },
    });
    const collection: Collection = {
      id: 'collection_1',
      name: '研究合集',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-10T12:00:00.000Z',
    };

    renderLibrary([], { collections: [collection], onAddCollectionMembers: addCollectionMembers });

    fireEvent.click(screen.getByRole('button', { name: '打开合集：研究合集' }));
    fireEvent.click(screen.getByRole('button', { name: '添加内容' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '添加已有文章' }));
    const picker = document.querySelector<HTMLElement>('.library-collection-picker-dialog');
    expect(picker).toBeTruthy();
    await within(picker!).findAllByText('微信读书标题');
    fireEvent.click(within(picker!).getByRole('button', { name: '添加到此合集：微信读书标题' }));
    fireEvent.click(within(picker!).getByRole('button', { name: '加入 1 项' }));

    await waitFor(() =>
      expect(addCollectionMembers).toHaveBeenCalledWith(collection.id, [
        { kind: 'weread', id: 'weread_1' },
      ]),
    );
  });

  it('exposes a keyboard-accessible drag handle in the collection picker', async () => {
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
    expect(within(picker!).getByRole('button', { name: '拖动「待拖入合集」' })).toBeTruthy();
  });

  it('does not enable dragging from the reading library list', () => {
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
    expect(screen.queryByRole('button', { name: '拖动「可拖文章」' })).toBeNull();
    expect(articleCard?.hasAttribute('draggable')).toBe(false);
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
    expect(playAppSoundEffect).toHaveBeenCalledWith(
      'library.delete_item',
      expect.objectContaining({ soundEffectsEnabled: true, soundEffectsVolume: 0.42 }),
    );
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

    await waitFor(() => expect(onSaveSettings).toHaveBeenCalledWith({ libraryPageSize: 24 }));
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

  it('searches source metadata without reading status filters', async () => {
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
    await waitFor(() => expect(screen.queryByText('批注文章')).toBeNull());
    expect(screen.getAllByText('新文章').length).toBeGreaterThan(0);
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
          kind: 'scroll',
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
});
