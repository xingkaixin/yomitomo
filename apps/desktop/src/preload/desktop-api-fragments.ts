import { ipcRenderer } from 'electron';
import type {
  AgentAnnotatePayload,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  ArticleStorePatch,
  ArticleTranslation,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import type { AppMenuCommand } from '../app-menu-types';
import { DesktopStoreLoadError } from '../app-store-errors';
import type { AppUpdateState } from '../app-update-types';
import { desktopIpcErrorFromSerialized, type DesktopIpcInvokeEnvelope } from '../ipc-errors';
import {
  desktopIpcInvokeRoutes,
  type AnnotationDiscussionWindowStateEvent,
  type AnnotationDistillationCommittedEvent,
  type DesktopIpcInvokeApi,
  type DesktopIpcInvokeChannel,
  type DesktopIpcStreamProgressEvent,
  type WeReadState,
} from '../ipc-contract';
import {
  electronDesktopIpcStreamTransport,
  onDesktopIpcRendererEvent,
  sendDesktopIpcMainEvent,
} from './ipc-events';
import { createDesktopIpcStreamClient } from './ipc-stream-client';

const desktopIpcStreamClient = createDesktopIpcStreamClient(electronDesktopIpcStreamTransport);
let pdfiumWasmUrlPromise: Promise<string> | undefined;

export type DesktopPreloadApiInput = {
  platform: NodeJS.Platform;
  preloadLoadedAt: number;
};

export function createYomitomoDesktopApi(input: DesktopPreloadApiInput) {
  const invokeApi = createDesktopIpcInvokeApi();
  const readPdfiumWasmUrl = invokeApi.app.readPdfiumWasmUrl;

  return {
    platform: input.platform,
    startupTiming: {
      preloadLoadedAt: input.preloadLoadedAt,
    },
    ...invokeApi,
    app: {
      ...invokeApi.app,
      readPdfiumWasmUrl: () => (pdfiumWasmUrlPromise ??= readPdfiumWasmUrl()),
      showMainWindow: () => sendDesktopIpcMainEvent('app:renderer-ready'),
      onMenuCommand: (callback: (command: AppMenuCommand) => void) =>
        onDesktopIpcRendererEvent('app-menu:command', (command) => {
          if (isAppMenuCommand(command)) callback(command);
        }),
    },
    store: {
      ...invokeApi.store,
      getState: async () => {
        const result = await invokeApi.store.getStateResult();
        if (result.ok) return result.store;
        throw new DesktopStoreLoadError(result.error);
      },
      onUpdated: (callback: (store: DesktopStore) => void) =>
        onDesktopIpcRendererEvent('store:updated', callback),
    },
    annotations: {
      ...invokeApi.annotations,
      discussion: {
        ...invokeApi.annotations.discussion,
        onThoughtDraftAvailable: (callback: () => void) =>
          onDesktopIpcRendererEvent('annotation-discussion:thought-draft-available', callback),
      },
      onDiscussionWindowState: (callback: (event: AnnotationDiscussionWindowStateEvent) => void) =>
        onDesktopIpcRendererEvent('annotation-discussion:window-state', callback),
      onDistillationCommitted: (callback: (event: AnnotationDistillationCommittedEvent) => void) =>
        onDesktopIpcRendererEvent('annotation-distillation:committed', callback),
      onWindowClosing: (callback: () => void) =>
        onDesktopIpcRendererEvent('annotation-window:closing', callback),
    },
    updates: {
      ...invokeApi.updates,
      onStatus: (callback: (state: AppUpdateState) => void) =>
        onDesktopIpcRendererEvent('updates:status', callback),
    },
    article: {
      ...invokeApi.article,
      onPatched: (callback: (patch: ArticleStorePatch) => void) =>
        onDesktopIpcRendererEvent('article:patched', callback),
      translation: {
        ...invokeApi.article.translation,
        onUpdated: (callback: (translation: ArticleTranslation) => void) =>
          onDesktopIpcRendererEvent('article-translation:updated', callback),
      },
    },
    library: {
      ...invokeApi.library,
      collections: {
        ...invokeApi.library.collections,
        onPatched: (callback: (patch: CollectionStorePatch) => void) =>
          onDesktopIpcRendererEvent('collection:patched', callback),
      },
      pins: {
        ...invokeApi.library.pins,
        onPatched: (callback: (patch: LibraryPinPatch) => void) =>
          onDesktopIpcRendererEvent('library-pin:patched', callback),
      },
    },
    weRead: {
      ...invokeApi.weRead,
      onStateUpdated: (callback: (state: WeReadState) => void) =>
        onDesktopIpcRendererEvent('weread:state-updated', callback),
    },
    agent: {
      ...invokeApi.agent,
      requestDistillationReviewStream: (
        payload: AgentDistillationReviewPayload,
        onEvent: (event: DesktopIpcStreamProgressEvent<'agent:distillation-review:stream'>) => void,
        signal?: AbortSignal,
      ) =>
        desktopIpcStreamClient.request(
          'agent:distillation-review:stream',
          payload,
          onEvent,
          (event) => event.message,
          signal,
        ),
      requestCommentStream: (
        payload: AgentMessagePayload,
        onEvent: (event: DesktopIpcStreamProgressEvent<'agent:comment:stream'>) => void,
        signal?: AbortSignal,
      ) =>
        desktopIpcStreamClient.request(
          'agent:comment:stream',
          payload,
          onEvent,
          (event) => event.comment,
          signal,
        ),
      requestAnnotationsStream: (
        payload: AgentAnnotatePayload,
        onEvent: (event: DesktopIpcStreamProgressEvent<'agent:annotate:stream'>) => void,
        signal?: AbortSignal,
      ) =>
        desktopIpcStreamClient.request(
          'agent:annotate:stream',
          payload,
          onEvent,
          (event) => ({
            annotations: event.annotations,
            readingMemory: event.readingMemory,
          }),
          signal,
        ),
    },
  };
}

function createDesktopIpcInvokeApi(): DesktopIpcInvokeApi {
  const api: Record<string, unknown> = {};

  for (const channel of Object.keys(desktopIpcInvokeRoutes) as DesktopIpcInvokeChannel[]) {
    const route = desktopIpcInvokeRoutes[channel] as readonly string[];
    let target = api;

    for (const segment of route.slice(0, -1)) {
      const child = target[segment];
      if (child && typeof child === 'object') {
        target = child as Record<string, unknown>;
      } else {
        const next: Record<string, unknown> = {};
        target[segment] = next;
        target = next;
      }
    }

    const operation = route.at(-1);
    if (operation) {
      target[operation] = (...args: unknown[]) => invokeDesktopIpc(channel, args);
    }
  }

  return api as DesktopIpcInvokeApi;
}

function isAppMenuCommand(value: unknown): value is AppMenuCommand {
  return (
    value === 'backup-database' ||
    value === 'check-updates' ||
    value === 'import-ebook' ||
    value === 'import-pdf' ||
    value === 'import-web' ||
    value === 'open-about' ||
    value === 'open-release-notes' ||
    value === 'open-settings' ||
    value === 'open-help-docs' ||
    value === 'report-issue' ||
    value === 'restore-database' ||
    value === 'sync-weread'
  );
}

function invokeDesktopIpc(channel: DesktopIpcInvokeChannel, args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(channel, ...args).then((result) => {
    const envelope = result as DesktopIpcInvokeEnvelope<unknown>;
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok) return envelope.value;
      throw desktopIpcErrorFromSerialized(envelope.error);
    }
    return result;
  });
}
