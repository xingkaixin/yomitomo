// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { articleCounts } from '@yomitomo/core';
import type {
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSummaryRecord,
  AppSettingsPatch,
  Collection,
  CollectionMember,
  ContentRef,
  LibraryPin,
  UserProfile,
} from '@yomitomo/shared';
import { createLibraryCatalogTestAdapter } from '../../../main/library/library-catalog-test-adapter';
import { ReadingLibrary } from '../reading-library/app-reading-library';
import { useLibraryQueryState } from '../reading-library/use-library-query-state';
import type { AppMenuCommandRequest } from '../../../app-menu-types';
import type {
  ArticleImportResult,
  LibraryCatalogListInput,
  LibraryCatalogListResult,
  SetLibraryPinInput,
} from '../../../ipc-contract';
import { initializeAppI18n } from '../i18n/app-i18n';
import { defaultTheme } from '../theme/app-theme';
import { articleActionStubs, articleStoreSinkStub } from './article-actions-test-utils';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

const feedbackSpies = vi.hoisted(() => ({
  playAppSoundEffect: vi.fn(),
  appToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: feedbackSpies.playAppSoundEffect,
}));

vi.mock('../shell/app-toast', () => ({
  appToast: feedbackSpies.appToast,
}));

export const { appToast, playAppSoundEffect } = feedbackSpies;

type TestReadingLibraryProps = Omit<
  React.ComponentProps<typeof ReadingLibrary>,
  'catalogRevision' | 'libraryQuery'
> & { active?: boolean };

export function TestReadingLibrary({ active = true, ...props }: TestReadingLibraryProps) {
  const libraryQuery = useLibraryQueryState();
  if (!active) return null;
  return <ReadingLibrary {...props} catalogRevision={0} libraryQuery={libraryQuery} />;
}

export const now = '2026-05-09T12:00:00.000Z';
export const articleStore = articleStoreSinkStub();
let closeDefaultCatalog: (() => void) | undefined;

export const userProfile: UserProfile = {
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
  closeDefaultCatalog?.();
  closeDefaultCatalog = undefined;
  vi.useRealTimers();
  cleanup();
  delete document.documentElement.dataset.themeTone;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  initializeAppI18n('zh-CN');
  document.documentElement.dataset.themeTone = defaultTheme.meta.tone;
});

export function annotation(id: string, createdAt = now): Annotation {
  return {
    id,
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 2,
    },
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt,
    updatedAt: createdAt,
  };
}

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;
type EbookArticleRecord = Extract<ArticleRecord, { sourceType: 'ebook' }>;
type PdfArticleRecord = Extract<ArticleRecord, { sourceType: 'pdf' }>;
type TextArticleRecord = Extract<ArticleRecord, { sourceType: 'text' }>;
type ArticleInput =
  | (Partial<WebArticleRecord> & { sourceType?: 'web' })
  | (Partial<EbookArticleRecord> & Pick<EbookArticleRecord, 'sourceType' | 'ebook'>)
  | (Partial<PdfArticleRecord> & Pick<PdfArticleRecord, 'sourceType' | 'pdf'>)
  | (Partial<TextArticleRecord> & Pick<TextArticleRecord, 'sourceType' | 'text'>);

export function article(overrides: ArticleInput = {}): ArticleRecord {
  const base = {
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
  };

  switch (overrides.sourceType) {
    case 'ebook':
      return { ...base, ...overrides, sourceType: 'ebook', ebook: overrides.ebook };
    case 'pdf':
      return { ...base, ...overrides, sourceType: 'pdf', pdf: overrides.pdf };
    case 'text':
      return { ...base, ...overrides, sourceType: 'text', text: overrides.text };
    default:
      return { ...base, ...overrides, sourceType: 'web' };
  }
}

export function articleSummary(record: ArticleRecord): ArticleSummaryRecord {
  const {
    annotations: _annotations,
    contentHtml: _contentHtml,
    ebook: _ebook,
    focusCoReadingPlan: _focusCoReadingPlan,
    pdf: _pdf,
    readerChatState: _readerChatState,
    sourceType: _sourceType,
    text: _text,
    ...summary
  } = record;
  const base = {
    ...summary,
    counts: articleCounts(record),
  };
  if (record.sourceType === 'ebook') {
    return {
      ...base,
      sourceType: 'ebook',
      ebook: { metadata: record.ebook.metadata },
    };
  }
  if (record.sourceType === 'pdf') return { ...base, sourceType: 'pdf', pdf: record.pdf };
  if (record.sourceType === 'text') return { ...base, sourceType: 'text', text: record.text };
  return { ...base, sourceType: 'web' };
}

export function annotationWithPublishedDistillation(id: string): Annotation {
  return {
    ...annotation(id),
    distillation: {
      status: 'published',
      content: `沉淀 ${id}`,
      publishedAt: '2026-05-09T12:04:00.000Z',
    },
  };
}

export function completedArticle(): ArticleRecord {
  return article({
    id: 'article_done',
    title: '完成阅读',
    annotations: [annotation('annotation_done')],
    readingProgress: {
      kind: 'scroll',
      progress: 1,
      updatedAt: '2026-05-09T12:03:00.000Z',
    },
  });
}

function immediateCatalogResult(
  value: LibraryCatalogListResult,
): Promise<LibraryCatalogListResult> {
  return {
    // oxlint-disable-next-line unicorn/no-thenable
    then(onFulfilled) {
      onFulfilled?.(value);
      return { catch: () => undefined } as unknown as Promise<LibraryCatalogListResult>;
    },
  } as Promise<LibraryCatalogListResult>;
}

export function installDefaultCatalog(
  articles: ArticleSummaryRecord[],
  options: {
    collectionMembers?: CollectionMember[];
    collections?: Collection[];
    pins?: LibraryPin[];
  } = {},
) {
  type DesktopApi = NonNullable<typeof window.yomitomoDesktop>;
  const desktopApi = window.yomitomoDesktop as Partial<DesktopApi> | undefined;
  if (desktopApi?.library?.catalog?.list) return;
  const catalog = createLibraryCatalogTestAdapter({
    articles,
    collectionMembers: options.collectionMembers || [],
    collections: options.collections || [],
    pins: options.pins || [],
  });
  closeDefaultCatalog = () => catalog.close();
  const readWeReadState = desktopApi?.weRead?.getState;
  const getWeReadState = readWeReadState
    ? async () => {
        const state = await readWeReadState();
        catalog.replaceWeReadBooks(state.books);
        return state;
      }
    : undefined;
  const subscribeToWeReadState = desktopApi?.weRead?.onStateUpdated;
  const onWeReadStateUpdated = subscribeToWeReadState
    ? (listener: Parameters<NonNullable<typeof subscribeToWeReadState>>[0]) =>
        subscribeToWeReadState((state) => {
          catalog.replaceWeReadBooks(state.books);
          listener(state);
        })
    : undefined;
  vi.stubGlobal('yomitomoDesktop', {
    ...desktopApi,
    annotations: {
      ...desktopApi?.annotations,
      onDiscussionWindowState:
        desktopApi?.annotations?.onDiscussionWindowState || vi.fn(() => vi.fn()),
      onDistillationCommitted:
        desktopApi?.annotations?.onDistillationCommitted || vi.fn(() => vi.fn()),
    },
    article: {
      ...desktopApi?.article,
      getCover: desktopApi?.article?.getCover || vi.fn(async () => null),
      translation: {
        ...desktopApi?.article?.translation,
        getCurrent: desktopApi?.article?.translation?.getCurrent || vi.fn(async () => null),
      },
    },
    library: {
      ...desktopApi?.library,
      catalog: {
        ...desktopApi?.library?.catalog,
        list: (input: LibraryCatalogListInput) => immediateCatalogResult(catalog.list(input)),
      },
    },
    weRead: {
      ...desktopApi?.weRead,
      getState: getWeReadState,
      onStateUpdated: onWeReadStateUpdated,
    },
  });
}

export function renderLibrary(
  articles: Array<ArticleRecord | ArticleSummaryRecord>,
  options: {
    onAddCollectionMembers?: (collectionId: string, members: ContentRef[]) => Promise<void>;
    onImportArticleUrl?: (url: string, requestId?: string) => Promise<ArticleImportResult>;
    onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
    onCreateCollection?: (name: string) => Promise<Collection>;
    onDeleteCollection?: (collectionId: string) => Promise<void>;
    onImportEbookFile?: (
      file: File,
      onProgress?: (progress: number) => void,
    ) => Promise<ArticleImportResult>;
    onImportPdfFile?: (
      file: File,
      onProgress?: (progress: number) => void,
    ) => Promise<ArticleImportResult>;
    onReadArticle?: (articleId: string) => Promise<ArticleRecord | null>;
    onRemoveCollectionMember?: (collectionId: string, member: ContentRef) => Promise<void>;
    onRenameCollection?: (collectionId: string, name: string) => Promise<void>;
    onDeleteArticle?: (articleId: string) => Promise<void> | void;
    onSaveArticleReadingProgress?: (
      articleId: string,
      progress: ArticleReadingProgress,
    ) => Promise<void> | void;
    onSaveSettings?: (settings: AppSettingsPatch) => Promise<void> | void;
    onSetLibraryPin?: (input: SetLibraryPinInput) => Promise<void>;
    onOpenDataSources?: () => void;
    collections?: Collection[];
    collectionMembers?: CollectionMember[];
    menuRequest?: AppMenuCommandRequest | null;
    pins?: LibraryPin[];
    settings?: AppSettingsPatch;
  } = {},
) {
  const summaries = articles.map((item) => ('counts' in item ? item : articleSummary(item)));
  installDefaultCatalog(summaries, options);
  const library = (
    <TestReadingLibrary
      agents={[]}
      articleActions={articleActionStubs({
        ...(options.onCancelArticleImport
          ? {
              cancelArticleUrlImport: async (requestId) =>
                Boolean(await options.onCancelArticleImport?.(requestId)),
            }
          : {}),
        deleteArticle: async (articleId) => {
          await options.onDeleteArticle?.(articleId);
        },
        ...(options.onImportArticleUrl ? { importArticleUrl: options.onImportArticleUrl } : {}),
        ...(options.onImportEbookFile ? { importEbookFile: options.onImportEbookFile } : {}),
        ...(options.onImportPdfFile ? { importPdfFile: options.onImportPdfFile } : {}),
        readArticle:
          options.onReadArticle ||
          (async (articleId) =>
            (articles.find((item) => item.id === articleId) as ArticleRecord | undefined) || null),
        saveArticleReadingProgress: async (articleId, progress) => {
          await options.onSaveArticleReadingProgress?.(articleId, progress);
        },
      })}
      articleStore={articleStore}
      articles={summaries}
      collectionMembers={options.collectionMembers}
      collections={options.collections}
      menuRequest={options.menuRequest}
      readerTheme={defaultTheme.reader}
      settings={normalizeAppSettings(options.settings)}
      userProfile={userProfile}
      onAddCollectionMembers={options.onAddCollectionMembers || vi.fn()}
      onCreateCollection={options.onCreateCollection || vi.fn()}
      onDeleteCollection={options.onDeleteCollection || vi.fn()}
      onRemoveCollectionMember={options.onRemoveCollectionMember || vi.fn()}
      onRenameCollection={options.onRenameCollection || vi.fn()}
      onSaveSettings={options.onSaveSettings}
      onSetLibraryPin={options.onSetLibraryPin || vi.fn()}
      onOpenDataSources={options.onOpenDataSources}
    />
  );
  const view = render(library);
  return Object.assign(view, {
    updateMenuRequest: (menuRequest: AppMenuCommandRequest) => {
      view.rerender(React.cloneElement(library, { menuRequest }));
    },
    remountLibrary: () => {
      view.rerender(React.cloneElement(library, { active: false }));
      view.rerender(library);
    },
  });
}

export function collectionActionStubs() {
  return {
    onAddCollectionMembers: vi.fn(),
    onCreateCollection: vi.fn(),
    onDeleteCollection: vi.fn(),
    onRemoveCollectionMember: vi.fn(),
    onRenameCollection: vi.fn(),
    onSetLibraryPin: vi.fn(),
  };
}

export function fileWithSize(name: string, size: number): File {
  const file = new File(['content'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

export function selectImportFile(container: HTMLElement, inputId: string, file: File) {
  selectImportFiles(container, inputId, [file]);
}

export function selectImportFiles(container: HTMLElement, inputId: string, files: File[]) {
  const input =
    container.querySelector<HTMLInputElement>(`#${inputId}`) ||
    document.querySelector<HTMLInputElement>(`#${inputId}`);
  expect(input).toBeTruthy();
  fireEvent.change(input!, { target: { files } });
}

export function deferredImportResult() {
  let resolve!: (value: ArticleImportResult) => void;
  const promise = new Promise<ArticleImportResult>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

export function successfulArticleImport(record: ArticleRecord): ArticleImportResult {
  return {
    status: 'imported',
    article: record,
    patch: { type: 'article-upsert', article: articleSummary(record) },
  };
}

export function hasScheduledDelay(
  setTimeoutSpy: { mock: { calls: Array<unknown[]> } },
  delayMs: number,
) {
  return setTimeoutSpy.mock.calls.some((call) => call[1] === delayMs);
}

export async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
  });
}

export async function selectLibraryType(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: '筛选内容类型' }));
  const option = await screen.findByRole('menuitemcheckbox', { name });
  fireEvent.click(option);
}

export async function openAddMenuItem(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: '添加内容' }));
  const item = await screen.findByRole('menuitem', { name });
  fireEvent.click(item);
}

export function stubReducedMotion(matches: boolean) {
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
