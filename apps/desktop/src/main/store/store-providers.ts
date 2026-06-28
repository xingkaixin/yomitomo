import { eq } from 'drizzle-orm';
import type { DesktopStore } from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import * as schema from '../db/schema';
import {
  buildProviderRecord,
  deleteProviderSecret,
  readProviderSecretStorageRow,
  resolveProviderApiKeyStorage,
  upsertProvider,
  type SaveProviderInput,
} from '../providers/provider-repository';
import { getDatabase } from './store-db';
import { readStore } from './store-snapshot';
import { upsertSettings } from './settings-repository';

export async function saveProvider(input: SaveProviderInput): Promise<DesktopStore> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = input.id
    ? store.providers.find((provider) => provider.id === input.id)
    : undefined;
  const id = existing?.id || makeId('provider');
  const existingRow = input.id ? readProviderSecretStorageRow(input.id) : undefined;
  const { apiKeyRef, storedApiKey } = await resolveProviderApiKeyStorage(id, input, existingRow);
  const provider = buildProviderRecord(input, {
    id,
    now,
    existing,
    apiKeyRef,
    storedApiKey,
  });

  upsertProvider(getDatabase(), provider, apiKeyRef, storedApiKey);
  return readStore();
}

export async function deleteProvider(id: string): Promise<DesktopStore> {
  await deleteProviderSecret(id);
  const database = getDatabase();
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
    tx.delete(schema.providers).where(eq(schema.providers.id, id)).run();
  });
  return readStore();
}
