import { startMainProcessRuntime as startRuntime } from '../../src/main/app/main-process-runtime';

export function startMainProcessRuntime(options: Parameters<typeof startRuntime>[0]) {
  return startRuntime({
    ...options,
    getPersistenceModules: async () => ({
      ...(await options.getPersistenceModules()),
      storeModelPricing: {
        refreshModelPrices: async () => ({
          refreshed: false,
          recordCount: 0,
          reason: 'fresh_cache',
        }),
      },
    }),
    getAppUpdaterModule: async () => ({
      checkForAppUpdates: async () => ({
        status: 'not-available',
        currentVersion: options.getAppVersion(),
      }),
    }),
  });
}
