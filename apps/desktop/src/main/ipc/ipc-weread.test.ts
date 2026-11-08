import { describe, expect, it, vi } from 'vitest';
import { registerWeReadIpc } from './ipc-weread';
import { testWeReadConnection } from '../weread/weread-client';

const ipcMocks = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMocks.ipcMainHandle,
  },
}));

vi.mock('../weread/weread-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../weread/weread-client')>();
  return {
    ...original,
    fetchWeReadBookDetail: vi.fn(),
    testWeReadConnection: vi.fn(),
  };
});

describe('weread IPC persistence boundary', () => {
  it('does not return raw WeRead test errors to the renderer or persisted state', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    vi.mocked(testWeReadConnection).mockReset();
    vi.mocked(testWeReadConnection).mockRejectedValueOnce(
      new Error('Authorization: Bearer weread-secret'),
    );
    const saveWeReadTestResult = vi.fn(async () => ({
      settings: { configured: false, openMethod: 'web' as const },
      books: [],
    }));

    registerWeReadIpc(weReadIpcContext({ saveWeReadTestResult }));

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'weread:test',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, 'weread-secret');

    expect(result).toEqual({
      ok: true,
      value: { ok: false, message: 'WEREAD_CONNECTION_FAILED' },
    });
    expect(saveWeReadTestResult).toHaveBeenCalledWith(false, 'WEREAD_CONNECTION_FAILED');
    expect(JSON.stringify(result)).not.toContain('weread-secret');
  });
});

type WeReadIpcContext = Parameters<typeof registerWeReadIpc>[0];
type WeReadPersistence = Awaited<
  ReturnType<WeReadIpcContext['getPersistenceModules']>
>['weReadRepository'];

function weReadIpcContext(
  persistenceOverrides: Partial<WeReadPersistence>,
  contextOverrides: Partial<WeReadIpcContext> = {},
): WeReadIpcContext {
  return {
    configureWeReadAutoSync: vi.fn(),
    elapsedMs: () => 1,
    getMainWindow: () => null,
    getPersistenceModules: async () => ({
      weReadRepository: {
        readStoredWeReadApiKey: vi.fn(),
        readWeReadApiKeyRef: vi.fn(),
        readWeReadBookDetail: vi.fn(),
        readWeReadReadingStatsState: vi.fn(),
        readWeReadSettings: vi.fn(),
        readWeReadState: vi.fn(),
        saveWeReadBookDetail: vi.fn(),
        saveWeReadLibrarySnapshot: vi.fn(),
        saveWeReadReadingStatsSnapshot: vi.fn(),
        saveWeReadSettings: vi.fn(),
        saveWeReadTestResult: vi.fn(),
        ...persistenceOverrides,
      },
    }),
    logError: vi.fn(),
    logInfo: vi.fn(),
    openExternalUrl: vi.fn(),
    ...contextOverrides,
  };
}
