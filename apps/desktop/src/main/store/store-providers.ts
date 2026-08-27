import { eq } from 'drizzle-orm';
import { makeId } from '@yomitomo/shared';
import type { ProviderStorePatch } from '../../ipc-contract';
import { ensurePresetAgents } from '../agents/agent-repository';
import { logError } from '../app/logger';
import * as schema from '../db/schema';
import {
  buildProviderRecord,
  resolveProviderApiKeyStorage,
  upsertProvider,
  type SaveProviderInput,
} from '../providers/provider-repository';
import {
  abortCredentialChange,
  commitCredentialChange,
  completeCommittedSecretDeletion,
  completeCredentialChange,
} from '../providers/credential-swap';
import { providerApiKeyRef } from '../providers/provider-secrets';
import { queueSecretDeletion } from '../providers/secret-deletion-repository';
import { getDatabase, type StoreDatabase } from './store-db';
import { migrateProviderApiKeys } from './store-provider-key-migration';
import { rowToAgent, rowToProvider, rowToSettings } from './store-normalizers';
import { upsertSettings } from './settings-repository';

const pendingProviderMutations = new Map<string, Promise<void>>();

export function saveProvider(input: SaveProviderInput): Promise<ProviderStorePatch> {
  return input.id
    ? withProviderMutation(input.id, () => saveProviderRecord(input))
    : saveProviderRecord(input);
}

async function saveProviderRecord(input: SaveProviderInput): Promise<ProviderStorePatch> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  const now = new Date().toISOString();
  const existingRow = input.id
    ? database.select().from(schema.providers).where(eq(schema.providers.id, input.id)).get()
    : undefined;
  if (input.id && !existingRow) throw new Error('Provider no longer exists');
  const existing = existingRow ? rowToProvider(existingRow) : undefined;
  const id = existing?.id || makeId('provider');
  const { credentialChange, storedApiKey } = await resolveProviderApiKeyStorage(
    id,
    input,
    existingRow,
  );
  const { apiKeyRef } = credentialChange;
  const provider = buildProviderRecord(input, {
    id,
    now,
    existing,
    apiKeyRef,
    storedApiKey,
  });

  try {
    database.transaction((tx) => {
      upsertProvider(tx, provider, apiKeyRef, storedApiKey);
      commitCredentialChange(tx, credentialChange);
    });
  } catch (error) {
    logError('credential_swap.transaction_failed', error, {
      owner: 'provider',
      ownerId: id,
      apiKeyRef,
    });
    await abortCredentialChange(credentialChange);
    throw error;
  }
  await completeCredentialChange(credentialChange, { owner: 'provider', ownerId: id });
  return readProviderStorePatch(database);
}

export function deleteProvider(id: string): Promise<ProviderStorePatch> {
  return withProviderMutation(id, () => deleteProviderRecord(id));
}

async function deleteProviderRecord(id: string): Promise<ProviderStorePatch> {
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
  await completeCommittedSecretDeletion(secretRef, { owner: 'provider', ownerId: id });
  return readProviderStorePatch(database);
}

async function withProviderMutation(id: string, run: () => Promise<ProviderStorePatch>) {
  const previous = pendingProviderMutations.get(id) || Promise.resolve();
  const result = previous.then(run);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  pendingProviderMutations.set(id, settled);
  try {
    return await result;
  } finally {
    if (pendingProviderMutations.get(id) === settled) pendingProviderMutations.delete(id);
  }
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
