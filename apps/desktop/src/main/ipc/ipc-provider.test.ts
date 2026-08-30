import { describe, expect, it, vi } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import { emptyDesktopStore } from '../../app-store';
import { ensureAdditiveSchemaColumns, migrations } from '../db/migrations';
import * as schema from '../db/schema';
import * as storeDb from '../store/store-db';
import * as storeSnapshot from '../store/store-snapshot';
import { saveSettings as saveStoredSettings } from '../store/store-settings';
import { upsertSettings } from '../store/settings-repository';
import { createReadingMemoryTelemetry } from '../telemetry/reading-memory-telemetry';
import { readTelemetryEnabled } from '../telemetry/telemetry-repository';
import { registerProviderIpc } from './ipc-provider';

const ipcMocks = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
  pruneLogFile: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMocks.ipcMainHandle,
  },
}));

vi.mock('../app/logger', () => ({
  pruneLogFile: ipcMocks.pruneLogFile,
}));

describe('provider IPC persistence boundary', () => {
  it.each(['resolved', 'rejected'] as const)(
    'clears counts when opt-out commits before a %s settings snapshot',
    async (outcome) => {
      ipcMocks.ipcMainHandle.mockClear();
      const sqlite = new SQLiteDatabase(':memory:');
      for (const migration of migrations) sqlite.exec(migration.sql);
      ensureAdditiveSchemaColumns(sqlite);
      const database = drizzle(sqlite, { schema });
      const getDatabase = vi.spyOn(storeDb, 'getDatabase').mockReturnValue(database);
      const store = desktopStore();
      let finish!: () => void;
      const snapshot = new Promise<DesktopStore>((resolve, reject) => {
        finish = () =>
          outcome === 'resolved' ? resolve(store) : reject(new Error('Snapshot unavailable'));
      });
      const readStore = vi.spyOn(storeSnapshot, 'readStore').mockReturnValue(snapshot);
      const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
      const telemetry = createReadingMemoryTelemetry({
        fetch: send,
        isEnabled: () => readTelemetryEnabled(database),
        endpoint: 'http://unused.local',
        timeoutMs: 2_000,
      });
      const onSettingsSaved = vi.fn(() => void telemetry.flush());
      const pending: Promise<unknown>[] = [];
      try {
        upsertSettings(database, { telemetryEnabled: true });
        registerProviderIpc(
          providerIpcContext({}, {}, { saveSettings: saveStoredSettings }, { onSettingsSaved }),
        );
        const handler = ipcMocks.ipcMainHandle.mock.calls.find(
          ([channel]) => channel === 'settings:save',
        )?.[1];
        telemetry.record('feature_opened');
        pending.push(handler({}, { telemetryEnabled: false }));
        await vi.waitFor(() => expect(readStore).toHaveBeenCalledOnce());
        const enabledAfterOptOut = readTelemetryEnabled(database);
        const notifiedAfterOptOut = onSettingsSaved.mock.calls.length;
        pending.push(handler({}, { telemetryEnabled: true }));
        await vi.waitFor(() => expect(readStore).toHaveBeenCalledTimes(2));
        finish();
        await Promise.all(pending);
        await telemetry.flush();
        expect(enabledAfterOptOut).toBe(false);
        expect(notifiedAfterOptOut).toBe(1);
        expect(send).not.toHaveBeenCalled();
      } finally {
        finish();
        await Promise.allSettled([...pending, snapshot]);
        telemetry.dispose();
        readStore.mockRestore();
        getDatabase.mockRestore();
        sqlite.close();
      }
    },
  );

  it.each([true, false])(
    'omits renderer consent %s while preserving ordinary settings changes',
    async (readingMemoryRemoteConsent) => {
      ipcMocks.ipcMainHandle.mockClear();
      const saveSettings = vi.fn(async () => desktopStore());
      registerProviderIpc(providerIpcContext({}, {}, { saveSettings }));
      const handler = ipcMocks.ipcMainHandle.mock.calls.find(
        ([channel]) => channel === 'settings:save',
      )?.[1];
      const input = { readingMemoryRemoteConsent, uiLanguage: 'en' };

      expect(await handler({}, input)).toMatchObject({ ok: true });
      expect(saveSettings).toHaveBeenCalledWith({ uiLanguage: 'en' });
      expect(input.readingMemoryRemoteConsent).toBe(readingMemoryRemoteConsent);
    },
  );

  it('forwards saved settings with their source event', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const store = desktopStore();
    const saveSettings = vi.fn(async (_input: AppSettingsPatch) => store);
    const readAppLockSettings = vi.fn(() => ({
      appLockEnabled: false,
      appLockLocked: false,
    }));
    const sendFullStoreUpdated = vi.fn();
    const onSettingsSaved = vi.fn();
    registerProviderIpc(
      providerIpcContext(
        {},
        {},
        { readAppLockSettings, saveSettings },
        { sendFullStoreUpdated, onSettingsSaved },
      ),
    );
    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'settings:save',
    )?.[1];
    const event = { sender: { id: 17 } };

    const result = await handler(event, { uiLanguage: 'en' });

    expect(result).toEqual({ ok: true, value: store });
    expect(readAppLockSettings).toHaveBeenCalledOnce();
    expect(sendFullStoreUpdated).toHaveBeenCalledWith(event, store);
    expect(onSettingsSaved).toHaveBeenCalledOnce();
    expect(onSettingsSaved.mock.invocationCallOrder[0]).toBeGreaterThan(
      saveSettings.mock.invocationCallOrder[0],
    );
    expect(onSettingsSaved.mock.invocationCallOrder[0]).toBeLessThan(
      sendFullStoreUpdated.mock.invocationCallOrder[0],
    );
  });

  it('rejects renderer-controlled app lock state changes through settings', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const saveSettings = vi.fn();
    const readAppLockSettings = vi.fn(() => ({
      appLockEnabled: true,
      appLockLocked: true,
    }));
    registerProviderIpc(providerIpcContext({}, {}, { readAppLockSettings, saveSettings }));
    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'settings:save',
    )?.[1];

    const result = await handler({}, { appLockLocked: false });

    expect(result).toMatchObject({
      error: { code: 'APP_LOCK_LOCKED_STATE_RESTRICTED' },
      ok: false,
    });
    expect(readAppLockSettings).toHaveBeenCalledOnce();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('reads provider API keys through provider persistence only', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const readStoredProviderApiKey = vi.fn(async () => 'provider-secret');

    registerProviderIpc(providerIpcContext({ readStoredProviderApiKey }));

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'provider:read-api-key',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, 'provider_1');

    expect(result).toEqual({ ok: true, value: 'provider-secret' });
    expect(readStoredProviderApiKey).toHaveBeenCalledWith('provider_1');
  });

  it('does not return raw provider test errors to the renderer', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const hydrateProviderInputApiKey = vi.fn(async () => ({
      id: 'provider_1',
      name: 'Provider',
      type: 'openai-chat' as const,
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-secret',
      modelName: 'model',
    }));
    const testProvider = vi.fn(async () => {
      throw new Error('Authorization: Bearer sk-secret');
    });

    registerProviderIpc(providerIpcContext({ hydrateProviderInputApiKey }, { testProvider }));

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'provider:test',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { id: 'provider_1' });

    expect(result).toEqual({
      ok: true,
      value: { ok: false, message: 'PROVIDER_TEST_FAILED' },
    });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });
});

type ProviderIpcContext = Parameters<typeof registerProviderIpc>[0];
type ProviderRepository = Awaited<
  ReturnType<ProviderIpcContext['getPersistenceModules']>
>['providerRepository'];
type ProviderAiModule = Awaited<ReturnType<ProviderIpcContext['getAiModule']>>;
type ProviderPersistenceModules = Awaited<ReturnType<ProviderIpcContext['getPersistenceModules']>>;

function providerIpcContext(
  providerOverrides: Partial<ProviderRepository>,
  aiOverrides: Partial<ProviderAiModule> = {},
  persistenceOverrides: {
    readAppLockSettings?: ProviderPersistenceModules['storeSettings']['readAppLockSettings'];
    saveSettings?: ProviderPersistenceModules['storeSettings']['saveSettings'];
  } = {},
  contextOverrides: Partial<ProviderIpcContext> = {},
): ProviderIpcContext {
  return {
    getAiModule: async () => ({
      listProviderModels: vi.fn(),
      testProvider: vi.fn(),
      ...aiOverrides,
    }),
    getPersistenceModules: async () => ({
      providerRepository: {
        hydrateProviderInputApiKey: vi.fn(),
        readStoredProviderApiKey: vi.fn(),
        ...providerOverrides,
      },
      storeProviders: {
        deleteProvider: vi.fn(),
        saveProvider: vi.fn(),
      },
      storeSettings: {
        readAppLockSettings:
          persistenceOverrides.readAppLockSettings ||
          vi.fn<ProviderPersistenceModules['storeSettings']['readAppLockSettings']>(() => ({
            appLockEnabled: false,
            appLockLocked: false,
          })),
        saveSettings:
          persistenceOverrides.saveSettings ||
          vi.fn<ProviderPersistenceModules['storeSettings']['saveSettings']>(),
        saveSettingsShell: vi.fn(),
        saveUser: vi.fn(),
      },
    }),
    sendFullStoreUpdated: vi.fn(),
    ...contextOverrides,
  };
}

function desktopStore(): DesktopStore {
  return {
    ...emptyDesktopStore,
    user: {
      id: 'user_1',
      nickname: 'User',
      username: 'user',
      avatar: '',
      annotationColor: '#000000',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  };
}
