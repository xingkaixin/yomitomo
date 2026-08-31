// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingMemoryStatusSnapshot } from '../../../ipc-contract';
import { initializeAppI18n } from '../i18n/app-i18n';
import { readingMemoryModelSources } from '../../../reading-memory-model-sources';
import { ReadingMemoryModelSettings } from '../settings/reading-memory-model-settings';

function status(
  modelStatus: ReadingMemoryStatusSnapshot['model']['status'] = 'available',
): ReadingMemoryStatusSnapshot {
  return {
    model: {
      status: modelStatus,
      internalId: 'reading-memory-v1',
      downloadSizeBytes: 218_123_456,
      downloadedBytes: 0,
      source: null,
      directory: '/Users/reader/Library/Application Support/yomitomo/reading-memory/models',
      failure: null,
    },
    projection: {
      state: 'available',
      coverage: { projectedAssetCount: 7, eligibleAssetCount: 9 },
    },
    semantic: {
      state: modelStatus === 'not-installed' ? 'not_installed' : 'available',
      modelVersion: 'reading-memory-v1',
      queryModelVersion: modelStatus === 'not-installed' ? null : 'reading-memory-v1',
      coverage: { indexedEntryCount: 4, eligibleEntryCount: 12 },
      indexingPaused: false,
    },
  };
}

function installApi(snapshot = status()) {
  const api = {
    model: {
      status: vi.fn().mockResolvedValue(snapshot),
      download: vi.fn().mockResolvedValue(status()),
      cancel: vi.fn().mockResolvedValue(status('not-installed')),
      remove: vi.fn().mockResolvedValue(status('not-installed')),
    },
    index: {
      pause: vi.fn().mockResolvedValue({
        ...snapshot,
        semantic: { ...snapshot.semantic, indexingPaused: true },
      }),
      resume: vi.fn().mockResolvedValue(snapshot),
      rebuild: vi.fn().mockResolvedValue({
        ...snapshot,
        semantic: { ...snapshot.semantic, state: 'rebuilding' },
      }),
    },
    relations: { judge: vi.fn() },
  };
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: { readingMemory: api },
  });
  return api;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.useRealTimers();
});

describe('ReadingMemoryModelSettings', () => {
  it('discloses the exact download size, source, directory, and separate coverage before opt-in', async () => {
    const snapshot = status('not-installed');
    const api = installApi(snapshot);
    render(<ReadingMemoryModelSettings />);

    expect(await screen.findByRole('button', { name: '下载模型' })).toBeTruthy();
    expect(screen.getByText('218.1 MB（218,123,456 字节）')).toBeTruthy();
    expect(screen.getByText(readingMemoryModelSources.modelscope.url)).toBeTruthy();
    expect(screen.getByText(snapshot.model.directory)).toBeTruthy();
    expect(screen.getByText('已整理 7 / 9 项资产')).toBeTruthy();
    expect(screen.getByText('已索引 4 / 12 条记忆')).toBeTruthy();
    expect(screen.getByText(/不生成回答，也不向模型供应商发送阅读内容/)).toBeTruthy();
    expect(api.model.download).not.toHaveBeenCalled();
    expect(api.relations.judge).not.toHaveBeenCalled();
  });

  it('allows cancellation while download is pending and ignores its late result', async () => {
    const api = installApi(status('not-installed'));
    const download = deferred<ReadingMemoryStatusSnapshot>();
    api.model.download.mockReturnValue(download.promise);
    const cancelled = status('not-installed');
    cancelled.model.downloadedBytes = 1_000_000;
    api.model.cancel.mockResolvedValue(cancelled);
    render(<ReadingMemoryModelSettings />);

    fireEvent.click(await screen.findByRole('button', { name: '下载模型' }));
    fireEvent.click(screen.getByRole('button', { name: '取消下载' }));

    expect(await screen.findByRole('button', { name: '继续下载' })).toBeTruthy();
    await act(async () => {
      download.resolve(status());
    });
    expect(screen.getByRole('button', { name: '继续下载' })).toBeTruthy();
    expect(screen.getByText('已保留 1 MB（1,000,000 字节），可继续下载。')).toBeTruthy();
    expect(api.model.download).toHaveBeenCalledOnce();
    expect(api.model.download).toHaveBeenCalledWith('modelscope');
    expect(api.model.cancel).toHaveBeenCalledOnce();
    expect(screen.queryByText('已就绪')).toBeNull();
  });

  it('downloads from the selected source only after explicit opt-in', async () => {
    const api = installApi(status('not-installed'));
    render(<ReadingMemoryModelSettings />);
    fireEvent.click(await screen.findByRole('combobox', { name: '下载源' }));
    const option = await screen.findByRole('option', { name: 'Hugging Face' });
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.click(option);
    expect(screen.getByText(readingMemoryModelSources.huggingface.url)).toBeTruthy();
    expect(api.model.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '下载模型' }));
    await waitFor(() => expect(api.model.download).toHaveBeenCalledWith('huggingface'));
  });

  it('shows the active source when reopening settings during a download', async () => {
    const snapshot = status('downloading');
    snapshot.model.source = 'huggingface';
    installApi(snapshot);
    render(<ReadingMemoryModelSettings />);
    const source = await screen.findByRole('combobox', { name: '下载源' });
    expect(source.textContent).toContain('Hugging Face');
    expect(source.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(readingMemoryModelSources.huggingface.url)).toBeTruthy();
  });

  it('requires confirmation before deleting only model files and the derived index', async () => {
    const api = installApi();
    render(<ReadingMemoryModelSettings />);
    const remove = await screen.findByRole('button', { name: '删除模型与索引' });
    fireEvent.click(remove);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/批注、评论、沉淀与原文均会保留/)).toBeTruthy();
    expect(api.model.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消，保留现状' }));
    expect(api.model.remove).not.toHaveBeenCalled();

    fireEvent.click(remove);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '删除模型与索引' }),
    );
    await waitFor(() => expect(api.model.remove).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: '下载模型' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs pause, resume, and rebuild only from explicit actions', async () => {
    const api = installApi();
    render(<ReadingMemoryModelSettings />);
    fireEvent.click(await screen.findByRole('button', { name: '暂停索引' }));
    fireEvent.click(await screen.findByRole('button', { name: '继续索引' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '重建索引' }).hasAttribute('disabled')).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: '重建索引' }));

    expect(await screen.findByText('正在重建')).toBeTruthy();
    expect(api.index.pause).toHaveBeenCalledOnce();
    expect(api.index.resume).toHaveBeenCalledOnce();
    expect(api.index.rebuild).toHaveBeenCalledOnce();
    expect(api.model.download).not.toHaveBeenCalled();
    expect(api.relations.judge).not.toHaveBeenCalled();
  });

  it('does not let an earlier poll overwrite an action and stops polling after unmount', async () => {
    vi.useFakeTimers();
    const api = installApi();
    const stalePoll = deferred<ReadingMemoryStatusSnapshot>();
    const unmountedPoll = deferred<ReadingMemoryStatusSnapshot>();
    api.model.status
      .mockResolvedValueOnce(status())
      .mockReturnValueOnce(stalePoll.promise)
      .mockReturnValueOnce(unmountedPoll.promise);
    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<ReadingMemoryModelSettings />));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '暂停索引' }));
    });
    await act(async () => {
      stalePoll.resolve(status());
    });
    expect(screen.getByRole('button', { name: '继续索引' })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(api.model.status).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => {
      unmountedPoll.resolve(status());
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.model.status).toHaveBeenCalledTimes(3);
    expect(api.model.cancel).not.toHaveBeenCalled();
  });

  it('offers status retry and reports action failure without losing the last snapshot', async () => {
    const api = installApi();
    api.model.status.mockRejectedValueOnce(new Error('offline'));
    api.index.pause.mockRejectedValueOnce(new Error('unavailable'));
    render(<ReadingMemoryModelSettings />);
    fireEvent.click(await screen.findByRole('button', { name: '重试读取' }));
    fireEvent.click(await screen.findByRole('button', { name: '暂停索引' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '操作未完成，请重试。');
    expect(screen.getByText('已索引 4 / 12 条记忆')).toBeTruthy();
    expect(screen.getByRole('button', { name: '暂停索引' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows unsupported platform status without offering an enabled download', async () => {
    const snapshot = status('failed');
    snapshot.model.failure = 'unsupported-platform';
    installApi(snapshot);
    render(<ReadingMemoryModelSettings />);

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      '当前系统尚不支持此本地模型。',
    );
    expect(screen.getByRole('button', { name: '下载模型' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(snapshot.model.directory)).toBeTruthy();
  });
});
