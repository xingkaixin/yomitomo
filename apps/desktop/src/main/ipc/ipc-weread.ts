import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import { buildWeReadOpenUrl, getWeReadStatsPeriodStart } from '../weread/weread-protocol';
import { syncWeReadLibrary } from '../weread/weread-sync';

type WeReadIpcContext = Pick<
  DesktopMainIpcContext,
  'configureWeReadAutoSync' | 'elapsedMs' | 'logError' | 'logInfo' | 'openExternalUrl'
> & {
  getPersistenceModules: () => Promise<{
    weReadRepository: Pick<
      typeof import('../weread/weread-repository'),
      | 'readStoredWeReadApiKey'
      | 'readWeReadBookDetail'
      | 'readWeReadReadingStatsState'
      | 'readWeReadSettings'
      | 'readWeReadState'
      | 'saveWeReadBookDetail'
      | 'saveWeReadLibrarySnapshot'
      | 'saveWeReadReadingStatsSnapshot'
      | 'saveWeReadSettings'
      | 'saveWeReadTestResult'
    >;
  }>;
};

export function registerWeReadIpc(context: WeReadIpcContext) {
  handleDesktopIpc('weread:get-settings', async () => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    return weReadPersistence.readWeReadSettings();
  });
  handleDesktopIpc('weread:get-state', async () => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    return weReadPersistence.readWeReadState();
  });
  handleDesktopIpc('weread:read-api-key', async () => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    return weReadPersistence.readStoredWeReadApiKey();
  });
  handleDesktopIpc('weread:save-settings', async (_event, input) => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    const state = await weReadPersistence.saveWeReadSettings(input);
    context.configureWeReadAutoSync('settings-saved');
    return state;
  });
  handleDesktopIpc('weread:test', async (_event, apiKey) => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    const key = apiKey?.trim() || (await weReadPersistence.readStoredWeReadApiKey());
    if (!key) return { ok: false, message: 'WEREAD_API_KEY_REQUIRED' };
    try {
      const { testWeReadConnection } = await import('../weread/weread-client');
      const result = await testWeReadConnection(key);
      await weReadPersistence.saveWeReadTestResult(true, result.message);
      return result;
    } catch {
      const message = 'WEREAD_CONNECTION_FAILED';
      await weReadPersistence.saveWeReadTestResult(false, message);
      return { ok: false, message };
    }
  });
  handleDesktopIpc('weread:sync', async () => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    return syncWeReadLibrary({
      persistence: weReadPersistence,
      reason: 'manual',
      logInfo: context.logInfo,
      logError: context.logError,
      elapsedMs: context.elapsedMs,
    });
  });
  handleDesktopIpc('weread:sync-book', async (_event, bookId) => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    const apiKey = await weReadPersistence.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('WEREAD_API_KEY_REQUIRED');
    const { fetchWeReadBookDetail } = await import('../weread/weread-client');
    const detail = await fetchWeReadBookDetail(apiKey, bookId);
    return weReadPersistence.saveWeReadBookDetail(detail, context.logInfo);
  });
  handleDesktopIpc('weread:get-book', async (_event, bookId) => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    return weReadPersistence.readWeReadBookDetail(bookId);
  });
  handleDesktopIpc('weread:open', async (_event, target) => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    const settings = await weReadPersistence.readWeReadSettings();
    return context.openExternalUrl(buildWeReadOpenUrl(target, settings.openMethod));
  });
  handleDesktopIpc('weread:get-reading-stats', async () => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    return weReadPersistence.readWeReadReadingStatsState();
  });
  handleDesktopIpc('weread:query-reading-stats', async (_event, input) => {
    const { weReadRepository: weReadPersistence } = await context.getPersistenceModules();
    const apiKey = await weReadPersistence.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('WEREAD_API_KEY_REQUIRED');
    const { fetchWeReadReadingStats } = await import('../weread/weread-client');
    const sourceBaseTime =
      input.mode === 'overall' ? undefined : Math.floor((input.baseTime ?? Date.now()) / 1000);
    const periodStart = getWeReadStatsPeriodStart(input.mode, sourceBaseTime);
    const data = await fetchWeReadReadingStats(apiKey, input.mode, sourceBaseTime);
    return weReadPersistence.saveWeReadReadingStatsSnapshot({
      id: `${input.mode}:${periodStart}`,
      mode: input.mode,
      periodStart,
      sourceBaseTime,
      data,
      fetchedAt: new Date().toISOString(),
    });
  });
}
