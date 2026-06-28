import { eq } from 'drizzle-orm';
import { logError } from '../app/logger';
import * as schema from '../db/schema';
import { saveProviderApiKey } from '../providers/provider-secrets';
import { purgeSqliteFiles, type StoreDatabase } from './store-db';

let providerSecretsMigrated = false;

export function resetProviderApiKeyMigration() {
  providerSecretsMigrated = false;
}

export async function migrateProviderApiKeys(database: StoreDatabase) {
  if (providerSecretsMigrated) return;

  const providerRows = database.select().from(schema.providers).all();
  let legacySecretCleared = false;
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
      database
        .update(schema.providers)
        .set({ apiKey: '', apiKeyRef: null })
        .where(eq(schema.providers.id, provider.id))
        .run();
      logError('provider.migrate_api_key_failed', error, { providerId: provider.id });
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
  providerSecretsMigrated = true;
}

function purgeLegacyProviderApiKeysFromSqliteFiles() {
  purgeSqliteFiles();
}
