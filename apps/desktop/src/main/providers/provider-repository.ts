import { eq } from 'drizzle-orm';
import type { LlmProvider } from '@yomitomo/shared';
import { isChatGptOAuthProvider, makeId, providerPresets } from '@yomitomo/shared';
import * as schema from '../db/schema';
import { getValidChatGptAccessToken } from './chatgpt-oauth-repository';
import { prepareCredentialChange, type PreparedCredentialChange } from './credential-swap';
import { providerApiKeyRef, readProviderApiKey } from './provider-secrets';
import { getDatabase, type StoreExecutor } from '../store/store-db';
import {
  normalizeModelNames,
  normalizePresetId,
  normalizeProviderModelInputMode,
  normalizeProviderType,
} from '../store/store-normalizers';

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');

export class ProviderApiKeyRequiredError extends Error {
  constructor() {
    super('Provider API key is required');
    this.name = 'ProviderApiKeyRequiredError';
  }
}

export type SaveProviderInput = Partial<LlmProvider> & {
  cloneApiKeyFromProviderId?: string;
  removeApiKey?: boolean;
};

export type ProviderApiKeyStorage = {
  credentialChange: PreparedCredentialChange;
  storedApiKey: string;
};

type ProviderApiKeyStorageRow = {
  apiKey: string;
  apiKeyRef: string | null;
  presetId?: string | null;
};

export async function hydrateProviderApiKey(provider: LlmProvider): Promise<LlmProvider> {
  if (isChatGptOAuthProvider(provider)) {
    const accessToken = await getValidChatGptAccessToken();
    return {
      ...provider,
      type: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: accessToken,
    };
  }
  const apiKey =
    provider.apiKey?.trim() ||
    (await readProviderApiKey(readProviderSecretStorageRow(provider.id)?.apiKeyRef));
  if (!apiKey) throw new ProviderApiKeyRequiredError();
  return { ...provider, apiKey };
}

export async function hydrateProviderInputApiKey(
  provider: SaveProviderInput,
): Promise<Partial<LlmProvider>> {
  if (isChatGptOAuthProvider(provider)) {
    const accessToken = await getValidChatGptAccessToken();
    return {
      ...provider,
      type: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: accessToken,
    };
  }
  const sourceProviderId = provider.id || provider.cloneApiKeyFromProviderId;
  const apiKey =
    provider.apiKey?.trim() ||
    (!provider.removeApiKey && sourceProviderId
      ? await readProviderApiKey(readProviderSecretStorageRow(sourceProviderId)?.apiKeyRef)
      : '');
  return { ...provider, apiKey };
}

export async function readStoredProviderApiKey(providerId: string) {
  return readProviderApiKey(readProviderSecretStorageRow(providerId)?.apiKeyRef);
}

export async function resolveProviderApiKeyStorage(
  providerId: string,
  input: SaveProviderInput,
  existingRow: ProviderApiKeyStorageRow | undefined,
): Promise<ProviderApiKeyStorage> {
  const existingApiKeyRef = existingRow?.apiKeyRef || undefined;
  if (isChatGptOAuthProvider({ presetId: input.presetId || existingRow?.presetId || undefined })) {
    const credentialChange = await prepareCredentialChange({
      currentRef: existingApiKeyRef,
      defaultRef: providerApiKeyRef(providerId),
      remove: Boolean(existingApiKeyRef),
      secret: '',
    });
    return { credentialChange, storedApiKey: '' };
  }
  let secret = input.apiKey;
  // Clone copies the source secret into a dedicated keyring entry so deleting either provider never breaks the other.
  if (!existingRow && !secret?.trim() && !input.removeApiKey && input.cloneApiKeyFromProviderId) {
    const clonedSecret = await readStoredProviderApiKey(input.cloneApiKeyFromProviderId);
    if (clonedSecret) secret = clonedSecret;
  }
  const credentialChange = await prepareCredentialChange({
    currentRef: existingApiKeyRef,
    defaultRef: providerApiKeyRef(providerId),
    remove: input.removeApiKey,
    secret,
  });
  const retainsLegacyApiKey = !credentialChange.apiKeyRef && !input.removeApiKey;
  return {
    credentialChange,
    storedApiKey: retainsLegacyApiKey ? existingRow?.apiKey || '' : '',
  };
}

export function buildProviderRecord(
  input: SaveProviderInput,
  options: {
    existing?: LlmProvider;
    id?: string;
    now: string;
    apiKeyRef?: string;
  },
): LlmProvider {
  const { existing, apiKeyRef } = options;
  const id = options.id || existing?.id || makeId('provider');
  const preset =
    providerPresets.find((item) => item.id === input.presetId) ||
    (existing || input.type ? undefined : defaultProviderPreset);
  const modelInputMode =
    normalizeProviderModelInputMode(input.modelInputMode ?? existing?.modelInputMode) || 'list';

  const presetId = normalizePresetId(input.presetId || existing?.presetId || preset?.id);
  const isChatGpt = presetId === 'chatgpt';

  return {
    id,
    name: input.name?.trim() || existing?.name || preset?.name || 'Untitled Provider',
    type: isChatGpt
      ? 'openai-responses'
      : preset?.type || normalizeProviderType(input.type || existing?.type) || 'openai-chat',
    presetId,
    logo: input.logo || existing?.logo || preset?.logo,
    baseUrl: isChatGpt
      ? 'https://api.openai.com/v1'
      : input.baseUrl?.trim() ||
        existing?.baseUrl ||
        preset?.baseUrl ||
        defaultProviderPreset?.baseUrl ||
        'https://api.deepseek.com',
    apiKey: '',
    hasApiKey: isChatGpt ? false : Boolean(apiKeyRef),
    modelName:
      input.modelName?.trim() ||
      existing?.modelName ||
      preset?.modelName ||
      defaultProviderPreset?.modelName ||
      'deepseek-flash',
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
