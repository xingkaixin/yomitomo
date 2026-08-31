import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  desktopIpcInvokeDescriptors,
  type DesktopIpcInvokeArgs,
  type DesktopIpcInvokeChannel,
} from '../../ipc-contract';
import { desktopIpcErrorCodes } from '../../ipc-errors';
import {
  assertDesktopIpcRegistrationComplete,
  handleDesktopIpc,
  resetDesktopIpcRegistrationsForTest,
} from './ipc';
import { registerReadingMemoryIpc } from './ipc-reading-memory';

const state = vi.hoisted(() => ({
  enabled: undefined as boolean | undefined,
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      state.handlers.set(channel, handler);
    },
  },
}));

vi.mock('../store/store-db', () => ({
  withDatabaseLease: (operation: () => Promise<unknown>) => operation(),
}));

vi.mock('../../reading-memory-release', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../reading-memory-release')>();
  return {
    get readingMemoryEnabled() {
      return state.enabled ?? actual.readingMemoryEnabled;
    },
  };
});

type ReadingMemoryChannel = Extract<DesktopIpcInvokeChannel, `reading-memory:${string}`>;
const request = { requestId: 'request-1' };
const comparison = { ...request, comparisonId: 'comparison-1' };
const routeRevision = 'a'.repeat(64);
const args = {
  'reading-memory:record-usage': ['feature_opened'],
  'reading-memory:relations:search': [
    { ...request, articleId: 'article-1', context: { sourceType: 'web', quote: 'A passage' } },
  ],
  'reading-memory:relations:judge': [request],
  'reading-memory:relations:cancel': [request],
  'reading-memory:library:context': [{ scope: { kind: 'library' } }],
  'reading-memory:library:search': [
    {
      ...request,
      question: 'A question',
      scope: { kind: 'library' },
      expectedRouteRevision: routeRevision,
    },
  ],
  'reading-memory:library:answer': [request],
  'reading-memory:library:cancel': [request],
  'reading-memory:confirm-privacy': [],
  'reading-memory:review:queue': [],
  'reading-memory:review:start': [
    {
      ...request,
      asset: {
        articleId: 'article-1',
        annotationId: 'annotation-1',
        assetType: 'comment',
        assetId: 'comment-1',
      },
    },
  ],
  'reading-memory:review:reveal': [{ ...request, answer: 'My independent answer' }],
  'reading-memory:review:history': [request],
  'reading-memory:review:submit': [{ ...request, eventId: 'event-1', decision: 'changed' }],
  'reading-memory:review:cancel': [comparison],
  'reading-memory:review:search-evidence': [
    { ...comparison, expectedRouteRevision: routeRevision },
  ],
  'reading-memory:review:compare-evidence': [comparison],
  'reading-memory:model:status': [],
  'reading-memory:model:download': ['modelscope'],
  'reading-memory:model:cancel': [],
  'reading-memory:model:remove': [],
  'reading-memory:index:pause': [],
  'reading-memory:index:resume': [],
  'reading-memory:index:rebuild': [],
} satisfies { [Channel in ReadingMemoryChannel]: DesktopIpcInvokeArgs<Channel> };

beforeEach(() => {
  state.enabled = undefined;
  state.handlers.clear();
  resetDesktopIpcRegistrationsForTest();
});

describe('reading-memory release boundary', () => {
  it('keeps registration complete while disabled invocations reject before runtime work', async () => {
    state.enabled = false;
    const { context, operation } = runtimeContext();
    registerReadingMemoryIpc(context);
    expect([...state.handlers.keys()].toSorted()).toEqual(Object.keys(args).toSorted());

    for (const channel of Object.keys(desktopIpcInvokeDescriptors) as DesktopIpcInvokeChannel[]) {
      if (!channel.startsWith('reading-memory:')) handleDesktopIpc(channel, operation);
    }
    expect(() => assertDesktopIpcRegistrationComplete()).not.toThrow();

    for (const [channel, input] of Object.entries(args)) {
      const response = await state.handlers.get(channel)!({ sender: { id: 42 } }, ...input);
      expect(response, channel).toEqual({
        ok: false,
        error: {
          code: desktopIpcErrorCodes.handlerFailed,
          message: 'Reading memory is not available in this release.',
        },
      });
    }
    expect(operation).not.toHaveBeenCalled();
  });

  it('routes the default build through the existing typed handlers', async () => {
    const { context, operation } = runtimeContext();
    const cancelRelations = vi.fn();
    const cancelLibrary = vi.fn();
    const cancelReview = vi.fn();
    const confirmPrivacy = vi.fn(async () => undefined);
    const recordUsage = vi.fn();
    context.relations.cancel = cancelRelations;
    context.library.cancel = cancelLibrary;
    context.review.cancel = cancelReview;
    context.relations.confirmPrivacy = confirmPrivacy;
    context.recordUsage = recordUsage;
    registerReadingMemoryIpc(context);

    for (const channel of [
      'reading-memory:relations:cancel',
      'reading-memory:library:cancel',
      'reading-memory:review:cancel',
      'reading-memory:confirm-privacy',
      'reading-memory:record-usage',
    ] as const) {
      const response = await state.handlers.get(channel)!({ sender: { id: 42 } }, ...args[channel]);
      expect(response).toEqual({ ok: true, value: undefined });
    }
    expect(cancelRelations).toHaveBeenCalledExactlyOnceWith(42, request.requestId);
    expect(cancelLibrary).toHaveBeenCalledExactlyOnceWith(42, request.requestId);
    expect(cancelReview).toHaveBeenCalledExactlyOnceWith(
      42,
      request.requestId,
      comparison.comparisonId,
    );
    expect(confirmPrivacy).toHaveBeenCalledOnce();
    expect(recordUsage).toHaveBeenCalledExactlyOnceWith('feature_opened');
    expect(operation).not.toHaveBeenCalled();
  });
});

function runtimeContext() {
  const operation = vi.fn((): never => {
    throw new Error('Unexpected runtime invocation');
  });
  const context: Parameters<typeof registerReadingMemoryIpc>[0] = {
    relations: {
      search: operation,
      judge: operation,
      cancel: operation,
      cancelAll: operation,
      confirmPrivacy: operation,
    },
    library: {
      context: operation,
      search: operation,
      answer: operation,
      cancel: operation,
      cancelAll: operation,
    },
    review: {
      queue: operation,
      start: operation,
      reveal: operation,
      history: operation,
      submit: operation,
      cancel: operation,
      searchEvidence: operation,
      compareEvidence: operation,
      cancelAll: operation,
    },
    controls: {
      status: operation,
      download: operation,
      cancel: operation,
      remove: operation,
      pause: operation,
      resume: operation,
      rebuild: operation,
      reconcile: operation,
      suspendForAppUpdate: operation,
      resumeAfterAppUpdateFailure: operation,
      dispose: operation,
    },
    recordUsage: operation,
  };
  return { context, operation };
}
