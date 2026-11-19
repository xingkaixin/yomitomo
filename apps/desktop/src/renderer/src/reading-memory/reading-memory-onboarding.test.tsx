// @vitest-environment jsdom

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingEvidence, ReadingJudgmentOutput } from '@yomitomo/shared';
import type { ReadingMemoryStatusSnapshot } from '../../../ipc-contract';
import { initializeAppI18n } from '../i18n/app-i18n';
import { formatReadingLibraryAnswerMarkdown } from './reading-library-markdown';
import { ReadingLibraryAnswer } from './reading-library-answer';
import { ReadingRelationsPanel } from './reading-relations-panel';
import { readingMemoryActiveProgress } from './use-reading-memory-status';

const now = '2026-06-10T00:00:00.000Z';

function makeEvidence(id: string, title: string, content: string): ReadingEvidence {
  return {
    id,
    assetType: 'comment',
    role: 'judgment',
    authorKind: 'user',
    content,
    sourceVersion: 'v1',
    source: {
      ref: { kind: 'article', id: `article_${id}` },
      sourceType: 'web',
      title,
    },
    location: {
      annotationId: `ann_${id}`,
      anchor: { exact: '原文摘录', prefix: '', suffix: '', start: 0, end: 4 },
    },
    createdAt: now,
    updatedAt: now,
  };
}

function makeStatus(
  override: Partial<ReadingMemoryStatusSnapshot> = {},
): ReadingMemoryStatusSnapshot {
  return {
    model: {
      internalId: 'bge-small',
      status: 'available',
      directory: '/tmp/model',
      downloadSizeBytes: 100_000_000,
      downloadedBytes: 100_000_000,
      source: 'modelscope',
      failure: null,
    },
    projection: {
      state: 'available',
      coverage: { projectedAssetCount: 10, eligibleAssetCount: 10 },
    },
    semantic: {
      state: 'available',
      modelVersion: 'v1',
      queryModelVersion: 'v1',
      indexingPaused: false,
      coverage: { indexedEntryCount: 10, eligibleEntryCount: 10 },
    },
    ...override,
  };
}

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('reading memory onboarding, progress, and markdown copy', () => {
  it('formats library answers and citations into clean Markdown and skips invalid citations', () => {
    const evidence = [
      makeEvidence('ev_1', '学习之道', '刻意练习比重复时长更重要。'),
      makeEvidence('ev_2', '深度工作', '反馈循环决定迁移效率。'),
    ];
    const output: Extract<ReadingJudgmentOutput, { kind: 'library-answer' }> = {
      kind: 'library-answer',
      judgments: [{ text: '我更看重反馈质量而非投入时长。', evidenceIds: ['ev_1', 'ev_2'] }],
      supporting: [{ text: '无效引用应被过滤', evidenceIds: ['missing'] }],
      opposingOrLimiting: [],
      gaps: [{ text: '缺少长期记忆衰减方面的实证记录。', evidenceIds: ['ev_2'] }],
    };

    const md = formatReadingLibraryAnswerMarkdown({
      question: '我对学习的看法发生了哪些变化？',
      output,
      evidence,
      sectionTitles: {
        judgments: '已有判断',
        supporting: '支持证据',
        opposingOrLimiting: '反对或限制',
        gaps: '证据缺口',
      },
      fallbackSourceTitle: '未命名文章',
    });

    expect(md).toContain('# 我对学习的看法发生了哪些变化？');
    expect(md).toContain('## 已有判断');
    expect(md).toContain('- 我更看重反馈质量而非投入时长。');
    expect(md).toContain('  > **学习之道**：刻意练习比重复时长更重要。');
    expect(md).toContain('  > **深度工作**：反馈循环决定迁移效率。');
    expect(md).not.toContain('无效引用应被过滤');
    expect(md).toContain('## 证据缺口');
  });

  it('derives active progress for downloading, semantic indexing, and projection states', () => {
    expect(readingMemoryActiveProgress(makeStatus())).toBeNull();

    const downloading = readingMemoryActiveProgress(
      makeStatus({
        model: {
          ...makeStatus().model,
          status: 'downloading',
          downloadSizeBytes: 200_000_000,
          downloadedBytes: 50_000_000,
        },
      }),
    );
    expect(downloading).toMatchObject({ kind: 'downloading', percent: 25 });

    const indexing = readingMemoryActiveProgress(
      makeStatus({
        semantic: {
          ...makeStatus().semantic,
          state: 'building',
          coverage: { indexedEntryCount: 3, eligibleEntryCount: 10 },
        },
      }),
    );
    expect(indexing).toEqual({ kind: 'semantic', indexed: 3, total: 10, percent: 30 });

    const paused = readingMemoryActiveProgress(
      makeStatus({
        semantic: {
          ...makeStatus().semantic,
          state: 'building',
          indexingPaused: true,
          coverage: { indexedEntryCount: 3, eligibleEntryCount: 10 },
        },
      }),
    );
    expect(paused).toBeNull();
  });

  it('shows direct setup CTAs in ReadingRelationsPanel when local model and provider are missing', () => {
    const onClose = vi.fn();
    const onOpenLocalModelSettings = vi.fn();
    const onOpenModelSettings = vi.fn();
    const queryClient = new QueryClient();

    const { getByRole } = render(
      <QueryClientProvider client={queryClient}>
        <ReadingRelationsPanel
          state={{
            phase: 'ready',
            remote: 'idle',
            request: {
              requestId: 'req_1',
              articleId: 'article_1',
              context: { sourceType: 'web', quote: '选中的句子', title: '测试文章' },
            },
            result: {
              requestId: 'req_1',
              mode: 'keyword',
              evidence: [],
              provider: null,
              remoteConsentRequired: false,
              projection: {
                state: 'available',
                coverage: { projectedAssetCount: 4, eligibleAssetCount: 4 },
              },
              semantic: {
                state: 'not_installed',
                modelVersion: 'v1',
                queryModelVersion: null,
                indexingPaused: false,
                coverage: { indexedEntryCount: 0, eligibleEntryCount: 4 },
              },
            },
          }}
          returnFocus={{ current: null }}
          onClose={onClose}
          onDismissPrivacy={vi.fn()}
          onJudge={vi.fn()}
          onOpenLocalModelSettings={onOpenLocalModelSettings}
          onOpenModelSettings={onOpenModelSettings}
          onSearch={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(getByRole('button', { name: '前往下载本地模型' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenLocalModelSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(getByRole('button', { name: '前往配置模型服务' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onOpenModelSettings).toHaveBeenCalledTimes(1);
  });

  it('copies full formatted Markdown with citations from ReadingLibraryAnswer', () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const evidence = [makeEvidence('ev_1', '阅读笔记', '结构化复盘能加深理解。')];
    const output: Extract<ReadingJudgmentOutput, { kind: 'library-answer' }> = {
      kind: 'library-answer',
      judgments: [{ text: '复盘是关键。', evidenceIds: ['ev_1'] }],
      supporting: [],
      opposingOrLimiting: [],
      gaps: [],
    };

    const { getByRole } = render(
      <ReadingLibraryAnswer
        question="如何加深阅读理解？"
        output={output}
        evidence={evidence}
        onOpenEvidenceSource={vi.fn()}
        onSaveThought={vi.fn()}
      />,
    );

    fireEvent.click(getByRole('button', { name: '复制 Markdown' }));
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0]?.[0] ?? '';
    expect(copied).toContain('# 如何加深阅读理解？');
    expect(copied).toContain('- 复盘是关键。');
    expect(copied).toContain('**阅读笔记**：结构化复盘能加深理解。');
  });
});
