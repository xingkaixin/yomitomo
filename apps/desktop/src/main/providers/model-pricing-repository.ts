import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { LlmProvider } from '@yomitomo/shared';
import { Effect } from 'effect';
import * as schema from '../db/schema';
import { withTimeoutAbortSignalEffect } from '../effect-abort-signal';
import type { StoreDatabase, StoreExecutor } from '../store/store-db';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const MODELS_DEV_TIMEOUT_MS = 15_000;
const MODEL_PRICE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MODEL_PRICE_STALE_MS = 24 * 60 * 60 * 1000;

export type NormalizedAiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
};

type ModelPriceRecord = {
  id: string;
  providerId: string;
  modelId: string;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  cacheReadCostPerMillion?: number;
  cacheWriteCostPerMillion?: number;
  currency: 'USD';
  source: 'models.dev';
  fetchedAt: string;
  updatedAt: string;
};

type ModelsDevProvider = {
  id?: unknown;
  models?: Record<string, ModelsDevModel>;
};

type ModelsDevModel = {
  id?: unknown;
  cost?: {
    input?: unknown;
    output?: unknown;
    cache_read?: unknown;
    cache_write?: unknown;
  };
};

export function estimateAssistantRunCostMicros(
  database: StoreExecutor,
  provider: LlmProvider,
  usage: NormalizedAiUsage | undefined,
) {
  if (!usage) return null;
  const price = findModelPrice(database, provider);
  return price ? calculateCostMicros(usage, price) : null;
}

export async function refreshModelsDevPrices(database: StoreDatabase) {
  return Effect.runPromise(refreshModelsDevPricesEffect(database));
}

function refreshModelsDevPricesEffect(database: StoreDatabase) {
  return Effect.gen(function* () {
    const shouldRefresh = yield* Effect.sync(() => shouldRefreshModelPrices(database));
    if (!shouldRefresh) {
      yield* Effect.sync(() => backfillAssistantExecutionRunCosts(database));
      return { refreshed: false, recordCount: 0, reason: 'fresh_cache' as const };
    }

    const fetchedAt = new Date().toISOString();
    const records = normalizeModelsDevPriceRecords(
      yield* fetchModelsDevCatalogueEffect(),
      fetchedAt,
    );
    yield* Effect.try({
      try: () =>
        database.transaction((tx) => {
          for (const record of records) upsertModelPriceRecord(tx, record);
          backfillAssistantExecutionRunCosts(tx);
        }),
      catch: (error) => error,
    });
    return { refreshed: true, recordCount: records.length, reason: 'updated' as const };
  });
}

export function modelPriceRefreshIntervalMs() {
  return MODEL_PRICE_REFRESH_INTERVAL_MS;
}

function shouldRefreshModelPrices(database: StoreExecutor) {
  const latest = database
    .select({ fetchedAt: schema.modelPriceRecords.fetchedAt })
    .from(schema.modelPriceRecords)
    .orderBy(desc(schema.modelPriceRecords.fetchedAt))
    .limit(1)
    .get();
  if (!latest?.fetchedAt) return true;
  const fetchedAt = new Date(latest.fetchedAt).getTime();
  return !Number.isFinite(fetchedAt) || Date.now() - fetchedAt >= MODEL_PRICE_STALE_MS;
}

function fetchModelsDevCatalogueEffect() {
  return withTimeoutAbortSignalEffect(MODELS_DEV_TIMEOUT_MS, [], (timeoutSignal) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: (effectSignal) =>
          fetch(MODELS_DEV_URL, {
            signal: AbortSignal.any([timeoutSignal, effectSignal]),
          }),
        catch: (error) => modelsDevFetchError(error),
      });
      if (!response.ok) {
        return yield* Effect.fail(new Error(`models.dev 返回 ${response.status}`));
      }
      return yield* Effect.tryPromise({
        try: () => response.json() as Promise<Record<string, ModelsDevProvider>>,
        catch: (error) => new Error(`models.dev 响应解析失败：${errorMessage(error)}`),
      });
    }),
  );
}

function modelsDevFetchError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error('models.dev 请求超时', {
      cause: error,
    });
  }
  return new Error(`models.dev 请求失败：${errorMessage(error)}`, { cause: error });
}

function normalizeModelsDevPriceRecords(
  catalogue: Record<string, ModelsDevProvider>,
  fetchedAt: string,
): ModelPriceRecord[] {
  const records: ModelPriceRecord[] = [];
  for (const [providerKey, provider] of Object.entries(catalogue)) {
    const providerId = stringField(provider.id) || providerKey;
    for (const [modelKey, model] of Object.entries(provider.models || {})) {
      const cost = model.cost || {};
      const inputCostPerMillion = numberField(cost.input);
      const outputCostPerMillion = numberField(cost.output);
      const cacheReadCostPerMillion = numberField(cost.cache_read);
      const cacheWriteCostPerMillion = numberField(cost.cache_write);
      if (
        inputCostPerMillion === undefined &&
        outputCostPerMillion === undefined &&
        cacheReadCostPerMillion === undefined &&
        cacheWriteCostPerMillion === undefined
      ) {
        continue;
      }
      const modelId = stringField(model.id) || modelKey;
      records.push({
        id: modelPriceRecordId(providerId, modelId),
        providerId,
        modelId,
        inputCostPerMillion,
        outputCostPerMillion,
        cacheReadCostPerMillion,
        cacheWriteCostPerMillion,
        currency: 'USD',
        source: 'models.dev',
        fetchedAt,
        updatedAt: fetchedAt,
      });
    }
  }
  return records;
}

function upsertModelPriceRecord(database: StoreExecutor, record: ModelPriceRecord) {
  database
    .insert(schema.modelPriceRecords)
    .values({
      id: record.id,
      providerId: record.providerId,
      modelId: record.modelId,
      inputCostPerMillion: record.inputCostPerMillion ?? null,
      outputCostPerMillion: record.outputCostPerMillion ?? null,
      cacheReadCostPerMillion: record.cacheReadCostPerMillion ?? null,
      cacheWriteCostPerMillion: record.cacheWriteCostPerMillion ?? null,
      currency: record.currency,
      source: record.source,
      fetchedAt: record.fetchedAt,
      updatedAt: record.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.modelPriceRecords.id,
      set: {
        inputCostPerMillion: record.inputCostPerMillion ?? null,
        outputCostPerMillion: record.outputCostPerMillion ?? null,
        cacheReadCostPerMillion: record.cacheReadCostPerMillion ?? null,
        cacheWriteCostPerMillion: record.cacheWriteCostPerMillion ?? null,
        currency: record.currency,
        source: record.source,
        fetchedAt: record.fetchedAt,
        updatedAt: record.updatedAt,
      },
    })
    .run();
}

function backfillAssistantExecutionRunCosts(database: StoreExecutor) {
  const runs = database
    .select()
    .from(schema.assistantExecutionRuns)
    .where(
      and(
        isNull(schema.assistantExecutionRuns.estimatedCostMicros),
        isNotNull(schema.assistantExecutionRuns.inputTokens),
        isNotNull(schema.assistantExecutionRuns.outputTokens),
      ),
    )
    .all();
  const providers = database.select().from(schema.providers).all();
  for (const run of runs) {
    const provider = providers.find((item) => item.id === run.providerId);
    const price = findModelPrice(database, {
      id: run.providerId,
      name: run.providerName,
      type: (provider?.type || 'openai-chat') as LlmProvider['type'],
      presetId: provider?.presetId as LlmProvider['presetId'],
      baseUrl: provider?.baseUrl || '',
      apiKey: '',
      modelName: run.modelName,
      createdAt: '',
      updatedAt: '',
    });
    if (!price) continue;
    const costMicros = calculateCostMicros(
      {
        inputTokens: run.inputTokens ?? undefined,
        outputTokens: run.outputTokens ?? undefined,
        cachedInputTokens: run.cachedInputTokens ?? undefined,
        cacheWriteTokens: run.cacheWriteTokens ?? undefined,
      },
      price,
    );
    database
      .update(schema.assistantExecutionRuns)
      .set({ estimatedCostMicros: costMicros, currency: price.currency })
      .where(eq(schema.assistantExecutionRuns.id, run.id))
      .run();
  }
}

function findModelPrice(database: StoreExecutor, provider: LlmProvider) {
  const providerIds = providerPriceAliases(provider);
  const modelIds = modelPriceAliases(provider.modelName);
  for (const providerId of providerIds) {
    for (const modelId of modelIds) {
      const record = database
        .select()
        .from(schema.modelPriceRecords)
        .where(
          and(
            eq(schema.modelPriceRecords.providerId, providerId),
            eq(schema.modelPriceRecords.modelId, modelId),
          ),
        )
        .limit(1)
        .get();
      if (record) return record;
    }
  }
  return null;
}

function calculateCostMicros(
  usage: NormalizedAiUsage,
  price: Pick<
    typeof schema.modelPriceRecords.$inferSelect,
    | 'inputCostPerMillion'
    | 'outputCostPerMillion'
    | 'cacheReadCostPerMillion'
    | 'cacheWriteCostPerMillion'
  >,
) {
  const inputTokens = usage.inputTokens || 0;
  const cachedInputTokens = Math.min(usage.cachedInputTokens || 0, inputTokens);
  const cacheWriteTokens = usage.cacheWriteTokens || 0;
  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = usage.outputTokens || 0;
  const input = billableInputTokens * (price.inputCostPerMillion || 0);
  const cacheRead =
    cachedInputTokens * (price.cacheReadCostPerMillion ?? price.inputCostPerMillion ?? 0);
  const cacheWrite =
    cacheWriteTokens * (price.cacheWriteCostPerMillion ?? price.inputCostPerMillion ?? 0);
  const output = outputTokens * (price.outputCostPerMillion || 0);
  return Math.round(input + cacheRead + cacheWrite + output);
}

function providerPriceAliases(provider: LlmProvider) {
  return uniqueStrings([
    providerIdFromBaseUrl(provider.baseUrl),
    provider.presetId,
    provider.presetId === 'mimo' ? 'xiaomi' : undefined,
    provider.presetId === 'gemini' ? 'google' : undefined,
    provider.presetId === 'doubao' ? 'volcengine' : undefined,
    provider.presetId === 'dashscope' ? 'alibaba' : undefined,
    provider.name.toLowerCase().replace(/\s+/g, '-'),
  ]);
}

function providerIdFromBaseUrl(baseUrl: string) {
  let host = '';
  try {
    host = new URL(baseUrl).host.toLowerCase();
  } catch {
    return '';
  }
  if (host === 'token-plan-cn.xiaomimimo.com') return 'xiaomi-token-plan-cn';
  if (host === 'token-plan-ams.xiaomimimo.com') return 'xiaomi-token-plan-ams';
  if (host === 'token-plan-sgp.xiaomimimo.com') return 'xiaomi-token-plan-sgp';
  if (host === 'api.xiaomimimo.com') return 'xiaomi';
  if (host === 'api.openai.com') return 'openai';
  if (host === 'api.anthropic.com') return 'anthropic';
  if (host === 'generativelanguage.googleapis.com') return 'google';
  if (host === 'api.deepseek.com') return 'deepseek';
  return host.replace(/^api\./, '').split('.')[0] || '';
}

function modelPriceAliases(modelName: string) {
  return uniqueStrings([modelName, `xiaomi/${modelName}`]);
}

function modelPriceRecordId(providerId: string, modelId: string) {
  return `${providerId}:${modelId}`;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean))) as string[];
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const modelPricingRepositoryTestApi = {
  refreshModelsDevPricesEffect,
};
