import { eq } from 'drizzle-orm';
import { logError } from '../app/logger';
import * as schema from '../db/schema';
import { saveProviderApiKey } from '../providers/provider-secrets';
import { purgeSqliteFiles, type StoreDatabase } from './store-db';

let providerSecretsMigration: { database: StoreDatabase; promise: Promise<void> } | undefined;

export function resetProviderApiKeyMigration() {
  providerSecretsMigration = undefined;
}

export function migrateProviderApiKeys(database: StoreDatabase) {
  if (providerSecretsMigration?.database === database) return providerSecretsMigration.promise;

  const promise = migrateProviderApiKeysOnce(database).then((retryNeeded) => {
    if (retryNeeded && providerSecretsMigration?.promise === promise) {
      providerSecretsMigration = undefined;
    }
  });
  providerSecretsMigration = { database, promise };
  return promise;
}

async function migrateProviderApiKeysOnce(database: StoreDatabase) {
  const providerRows = database.select().from(schema.providers).all();
  let legacySecretCleared = false;
  let retryNeeded = false;
  for (const provider of providerRows) {
    const apiKey = provider.apiKey.trim();
    if (!apiKey) continue;

    try {
      const apiKeyRef = await saveProviderApiKey(provider.id, apiKey);
      database
        .update(schema.providers)
        .set({ apiKey: '', apiKeyRef })
        .where(eq(schema.providers.id, provider.id))
        .run();
    } catch (error) {
      retryNeeded = true;
      logError('provider.migrate_api_key_failed', error, {
        providerId: provider.id,
        legacySecretRetained: true,
      });
      continue;
    }
    legacySecretCleared = true;
  }

  if (legacySecretCleared) {
    try {
      purgeLegacyProviderApiKeysFromSqliteFiles();
    } catch {
      // SQLite cleanup failure should not block state reads.
    }
  }
  return retryNeeded;
}

function purgeLegacyProviderApiKeysFromSqliteFiles() {
  purgeSqliteFiles();
}
