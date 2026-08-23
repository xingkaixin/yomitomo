// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  article,
  articleSummary,
  deferredImportResult,
  fileWithSize,
  flushMicrotasks,
  hasScheduledDelay,
  openAddMenuItem,
  playAppSoundEffect,
  renderLibrary,
  selectImportFile,
  selectImportFiles,
  selectLibraryType,
  successfulArticleImport,
} from './app-reading-library-test-support';

describe('ReadingLibrary imports', () => {
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
    const onImportArticleUrl = vi.fn().mockResolvedValue(successfulArticleImport(imported));
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
      deferred.resolve(successfulArticleImport(imported));
      await Promise.resolve();
    });
    await flushMicrotasks();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/slow')).toBeTruthy();
    expect(screen.queryByDisplayValue('晚到文章')).toBeNull();
  });

  it('shows webpage import errors inside the dialog', async () => {
    const onImportArticleUrl = vi
      .fn()
      .mockRejectedValue(new Error('ARTICLE_IMPORT_REQUEST_FAILED'));
    renderLibrary([], { onImportArticleUrl });

    await selectLibraryType(/网页文章/);
    await openAddMenuItem('添加网页文章');
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    expect(await screen.findByText('解析失败')).toBeTruthy();
    expect(screen.getByText('网页请求失败')).toBeTruthy();
    expect(screen.queryByText('Error')).toBeNull();
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
      return successfulArticleImport(imported);
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
    const onImportEbookFile = vi.fn().mockResolvedValue(successfulArticleImport(imported));
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
      return successfulArticleImport(file.name === 'one.epub' ? importedOne : importedTwo);
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
      return successfulArticleImport(imported);
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
    const onImportPdfFile = vi.fn().mockResolvedValue(successfulArticleImport(imported));
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
