import { eq } from 'drizzle-orm';
import { makeId } from '@yomitomo/shared';
import type { ProviderStorePatch } from '../../ipc-contract';
import { ensurePresetAgents } from '../agents/agent-repository';
import * as schema from '../db/schema';
import {
  buildProviderRecord,
  resolveProviderApiKeyStorage,
  upsertProvider,
  type SaveProviderInput,
} from '../providers/provider-repository';
import { providerApiKeyRef } from '../providers/provider-secrets';
import {
  cancelSecretDeletion,
  completeSecretDeletion,
  queueSecretDeletion,
} from '../providers/secret-deletion-repository';
import { getDatabase, type StoreDatabase } from './store-db';
import { migrateProviderApiKeys } from './store-provider-key-migration';
import { rowToAgent, rowToProvider, rowToSettings } from './store-normalizers';
import { upsertSettings } from './settings-repository';

export async function saveProvider(input: SaveProviderInput): Promise<ProviderStorePatch> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  const now = new Date().toISOString();
  const existingRow = input.id
    ? database.select().from(schema.providers).where(eq(schema.providers.id, input.id)).get()
    : undefined;
  const existing = existingRow ? rowToProvider(existingRow) : undefined;
  const id = existing?.id || makeId('provider');
  const { apiKeyRef, secretRefToDelete, storedApiKey } = await resolveProviderApiKeyStorage(
    id,
    input,
    existingRow,
  );
  const provider = buildProviderRecord(input, {
    id,
    now,
    existing,
    apiKeyRef,
    storedApiKey,
  });

  database.transaction((tx) => {
    upsertProvider(tx, provider, apiKeyRef, storedApiKey);
    if (secretRefToDelete) queueSecretDeletion(tx, secretRefToDelete);
    else if (apiKeyRef) cancelSecretDeletion(tx, apiKeyRef);
  });
  if (secretRefToDelete) await completeSecretDeletion(secretRefToDelete);
  return readProviderStorePatch(database);
}

export async function deleteProvider(id: string): Promise<ProviderStorePatch> {
  const database = getDatabase();
  const provider = database
    .select({ apiKeyRef: schema.providers.apiKeyRef })
    .from(schema.providers)
    .where(eq(schema.providers.id, id))
    .get();
  const secretRef = provider?.apiKeyRef || providerApiKeyRef(id);
  database.transaction((tx) => {
    const settings = tx.select().from(schema.appSettings).limit(1).get();
    if (
      settings?.defaultProviderId === id ||
      settings?.readingAssistantProviderId === id ||
      settings?.reviewAssistantProviderId === id ||
      settings?.bilingualTranslationProviderId === id
    ) {
      upsertSettings(tx, {
        defaultProviderId:
          settings.defaultProviderId === id ? undefined : (settings.defaultProviderId ?? undefined),
        readingAssistantProviderId:
          settings.readingAssistantProviderId === id
            ? undefined
            : (settings.readingAssistantProviderId ?? undefined),
        reviewAssistantProviderId:
          settings.reviewAssistantProviderId === id
            ? undefined
            : (settings.reviewAssistantProviderId ?? undefined),
        bilingualTranslationProviderId:
          settings.bilingualTranslationProviderId === id
            ? undefined
            : (settings.bilingualTranslationProviderId ?? undefined),
        saveArticleImages: settings.saveArticleImages,
      });
    }
    queueSecretDeletion(tx, secretRef);
    tx.delete(schema.providers).where(eq(schema.providers.id, id)).run();
  });
  await completeSecretDeletion(secretRef);
  return readProviderStorePatch(database);
}

function readProviderStorePatch(database: StoreDatabase): ProviderStorePatch {
  const settings = database.select().from(schema.appSettings).limit(1).get();
  const providers = database.select().from(schema.providers).all();
  const agents = ensurePresetAgents(database, providers, settings);
  return {
    agents: agents.map(rowToAgent),
    providers: providers.map(rowToProvider),
    settings: rowToSettings(settings),
  };
}
