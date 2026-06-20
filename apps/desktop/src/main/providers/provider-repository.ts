import { eq } from 'drizzle-orm';
import type { LlmProvider } from '@yomitomo/shared';
import { makeId, providerPresets } from '@yomitomo/shared';
import * as schema from '../db/schema';
import { deleteProviderApiKey, readProviderApiKey, saveProviderApiKey } from './provider-secrets';
import { getDatabase, type StoreExecutor } from '../store/store-db';
import {
  normalizeModelNames,
  normalizePresetId,
  normalizeProviderModelInputMode,
  normalizeProviderType,
} from '../store/store-normalizers';

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');

export type SaveProviderInput = Partial<LlmProvider> & {
  removeApiKey?: boolean;
};

export type ProviderApiKeyStorage = {
  apiKeyRef?: string;
  storedApiKey: string;
};

type ProviderApiKeyStorageRow = {
  apiKey: string;
  apiKeyRef: string | null;
};

export async function hydrateProviderApiKey(provider: LlmProvider): Promise<LlmProvider> {
  const apiKey = provider.apiKey?.trim() || (await readProviderApiKey(provider.id));
  if (!apiKey) throw new Error('PROVIDER_API_KEY_REQUIRED');
  return { ...provider, apiKey };
}

export async function hydrateProviderInputApiKey(
  provider: Partial<LlmProvider>,
): Promise<Partial<LlmProvider>> {
  const apiKey =
    provider.apiKey?.trim() || (provider.id ? await readProviderApiKey(provider.id) : '');
  return { ...provider, apiKey };
}

export async function readStoredProviderApiKey(providerId: string) {
  return readProviderApiKey(providerId);
}

export async function resolveProviderApiKeyStorage(
  providerId: string,
  input: SaveProviderInput,
  existingRow: ProviderApiKeyStorageRow | undefined,
): Promise<ProviderApiKeyStorage> {
  const existingApiKeyRef = existingRow?.apiKeyRef || undefined;
  const inputApiKey = input.apiKey?.trim();

  if (inputApiKey) {
    return {
      apiKeyRef: await saveProviderApiKey(providerId, inputApiKey),
      storedApiKey: '',
    };
  }

  if (input.removeApiKey) {
    return {
      apiKeyRef: existingApiKeyRef
        ? await removeProviderApiKey(providerId, existingApiKeyRef)
        : undefined,
      storedApiKey: '',
    };
  }

  if (existingApiKeyRef) {
    return { apiKeyRef: existingApiKeyRef, storedApiKey: '' };
  }

  return { storedApiKey: '' };
}

export function buildProviderRecord(
  input: SaveProviderInput,
  options: {
    existing?: LlmProvider;
    id?: string;
    now: string;
    apiKeyRef?: string;
    storedApiKey: string;
  },
): LlmProvider {
  const { existing, apiKeyRef, storedApiKey } = options;
  const id = options.id || existing?.id || makeId('provider');
  const preset =
    providerPresets.find((item) => item.id === input.presetId) ||
    (existing ? undefined : defaultProviderPreset);
  const modelInputMode =
    normalizeProviderModelInputMode(input.modelInputMode ?? existing?.modelInputMode) || 'list';

  return {
    id,
    name: input.name?.trim() || existing?.name || preset?.name || 'Untitled Provider',
    type: preset?.type || normalizeProviderType(input.type || existing?.type) || 'openai-chat',
    presetId: normalizePresetId(input.presetId || existing?.presetId || preset?.id),
    logo: input.logo || existing?.logo || preset?.logo,
    baseUrl:
      input.baseUrl?.trim() ||
      existing?.baseUrl ||
      preset?.baseUrl ||
      defaultProviderPreset?.baseUrl ||
      'https://api.deepseek.com',
    apiKey: '',
    hasApiKey: Boolean(apiKeyRef || storedApiKey),
    modelName:
      input.modelName?.trim() ||
      existing?.modelName ||
      preset?.modelName ||
      defaultProviderPreset?.modelName ||
      'deepseek-chat',
    modelNames:
      modelInputMode === 'custom'
        ? undefined
        : (normalizeModelNames(input.modelNames) ??
          normalizeModelNames(existing?.modelNames) ??
          preset?.modelNames),
    modelInputMode,
    reasoningEffort: 'none',
    createdAt: existing?.createdAt || options.now,
    updatedAt: options.now,
  };
}

export function readProviderSecretStorageRow(providerId: string) {
  return getDatabase()
    .select({
      apiKey: schema.providers.apiKey,
      apiKeyRef: schema.providers.apiKeyRef,
    })
    .from(schema.providers)
    .where(eq(schema.providers.id, providerId))
    .get();
}

export async function deleteProviderSecret(providerId: string) {
  await deleteProviderApiKey(providerId);
}

export function upsertProvider(
  database: StoreExecutor,
  provider: LlmProvider,
  apiKeyRef?: string,
  apiKey = '',
) {
  database
    .insert(schema.providers)
    .values({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      presetId: provider.presetId,
      logo: provider.logo,
      baseUrl: provider.baseUrl,
      apiKey,
      apiKeyRef: apiKeyRef || null,
      modelName: provider.modelName,
      modelNames: provider.modelNames,
      modelInputMode: provider.modelInputMode,
      reasoningEffort: provider.reasoningEffort,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.providers.id,
      set: {
        name: provider.name,
        type: provider.type,
        presetId: provider.presetId,
        logo: provider.logo,
        baseUrl: provider.baseUrl,
        apiKey,
        apiKeyRef: apiKeyRef || null,
        modelName: provider.modelName,
        modelNames: provider.modelNames,
        modelInputMode: provider.modelInputMode,
        reasoningEffort: provider.reasoningEffort,
        updatedAt: provider.updatedAt,
      },
    })
    .run();
}

async function removeProviderApiKey(providerId: string, apiKeyRef?: string) {
  await deleteProviderApiKey(providerId, apiKeyRef);
  return undefined;
}
