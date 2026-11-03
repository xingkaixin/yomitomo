// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingMemoryStatusSnapshot } from '../../../ipc-contract';
import { initializeAppI18n } from '../i18n/app-i18n';
import { readingMemoryModelSources } from '../../../reading-memory-model-sources';
import { ReadingMemoryModelSettings } from '../settings/reading-memory-model-settings';
import { renderWithQueryClient } from './query-test-utils';

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

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

describe('ReadingMemoryModelSettings', () => {
  it('downloads from the selected source only after explicit opt-in', async () => {
    const api = installApi(status('not-installed'));
    renderWithQueryClient(<ReadingMemoryModelSettings />);
    fireEvent.click(await screen.findByRole('combobox', { name: '下载源' }));
    const option = await screen.findByRole('option', { name: 'Hugging Face' });
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.click(option);
    expect(screen.getByText(readingMemoryModelSources.huggingface.url)).toBeTruthy();
    expect(api.model.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '下载模型' }));
    await waitFor(() => expect(api.model.download).toHaveBeenCalledWith('huggingface'));
  });
});
