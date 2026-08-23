import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import { initializeStartupStore } from './startup-store';
import { logError, pruneLogFile } from './logger';
import { normalizeAppSettings } from '../../settings/app-settings-normalization';

vi.mock('./logger', () => ({
  logError: vi.fn(),
  pruneLogFile: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startup store initialization', () => {
  it('applies startup locking without process-global state', async () => {
    const first = startupContext(unlockedStartupStore());
    const second = startupContext(unlockedStartupStore());

    await expect(initializeStartupStore(first.context)).resolves.toEqual({ ok: true });
    await expect(initializeStartupStore(second.context)).resolves.toEqual({ ok: true });

    expect(first.saveSettingsShell).toHaveBeenCalledWith({ appLockLocked: true });
    expect(second.saveSettingsShell).toHaveBeenCalledWith({ appLockLocked: true });
    expect(first.setSensitiveRendererEventsLocked).toHaveBeenCalledWith(true);
    expect(second.setSensitiveRendererEventsLocked).toHaveBeenCalledWith(true);
  });

  it('schedules log pruning and records startup profiling after loading', async () => {
    const { context, recordStartupTiming } = startupContext(startupStore());

    await expect(initializeStartupStore(context)).resolves.toEqual({ ok: true });

    expect(pruneLogFile).toHaveBeenCalledWith(30);
    expect(recordStartupTiming).toHaveBeenCalledWith('store.initialize_success', {
      durationMs: expect.any(Number),
      importDurationMs: expect.any(Number),
      readDurationMs: expect.any(Number),
      articleCount: 0,
      annotationCount: 0,
      thoughtCount: 0,
    });
    expect(recordStartupTiming).toHaveBeenCalledWith('store.initialize_profile', {
      steps: [{ name: 'read_settings', durationMs: 1 }],
    });
  });

  it('records aggregate counts from lightweight article summaries', async () => {
    const store = startupStore();
    store.articles = [
      {
        id: 'article_1',
        url: 'https://example.com/article',
        canonicalUrl: 'https://example.com/article',
        sourceType: 'web',
        title: 'Article',
        contentHash: 'hash_1',
        annotations: [],
        counts: {
          annotationCount: 4,
          thoughtCount: 3,
          discussionCommentCount: 2,
          aiCommentCount: 1,
          distillationCount: 1,
        },
        createdAt: '2026-07-27T08:00:00.000Z',
        updatedAt: '2026-07-27T08:00:00.000Z',
      },
    ];
    const { context, recordStartupTiming } = startupContext(store);

    await expect(initializeStartupStore(context)).resolves.toEqual({ ok: true });

    expect(recordStartupTiming).toHaveBeenCalledWith(
      'store.initialize_success',
      expect.objectContaining({
        articleCount: 1,
        annotationCount: 4,
        thoughtCount: 3,
      }),
    );
  });

  it('logs store startup failures without preventing app readiness', async () => {
    const options = { readError: new Error('database unavailable') };
    const { context, setSensitiveRendererEventsLocked } = startupContext(startupStore(), options);

    await expect(initializeStartupStore(context)).resolves.toEqual({
      ok: false,
      error: options.readError,
    });

    expect(logError).toHaveBeenCalledWith('store.initialize_failed', expect.any(Error));
    expect(setSensitiveRendererEventsLocked).not.toHaveBeenCalled();
    expect(pruneLogFile).not.toHaveBeenCalled();
  });
});

function startupContext(store: DesktopStore, options: { readError?: Error } = {}) {
  const saveSettingsShell = vi.fn(async (settings: AppSettingsPatch) => ({
    ...store,
    settings: normalizeAppSettings({ ...store.settings, ...settings }),
  }));
  const recordStartupTiming = vi.fn();
  const setSensitiveRendererEventsLocked = vi.fn();
  return {
    context: {
      getPersistenceModules: async () => ({
        storeSettings: { saveSettingsShell },
        storeSnapshot: {
          readShellStoreWithProfile: vi.fn(async () => {
            if (options.readError) throw options.readError;
            return {
              store,
              profile: [{ name: 'read_settings', durationMs: 1 }],
            };
          }),
        },
      }),
      recordStartupTiming,
      setSensitiveRendererEventsLocked,
    },
    recordStartupTiming,
    saveSettingsShell,
    setSensitiveRendererEventsLocked,
  };
}

function unlockedStartupStore(): DesktopStore {
  return startupStore({
    appLockEnabled: true,
    appLockLocked: false,
    appLockLockOnStartup: true,
  });
}

function startupStore(settings: AppSettingsPatch = { logRetentionDays: 30 }): DesktopStore {
  return {
    agents: [],
    articles: [],
    collectionMembers: [],
    collections: [],
    pins: [],
    providers: [],
    settings: normalizeAppSettings(settings),
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
