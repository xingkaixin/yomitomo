import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { refreshModelsDevPrices } from './model-pricing-repository';
import type { StoreDatabase } from '../store/store-db';

type ModelPriceRow = typeof schema.modelPriceRecords.$inferSelect;
type AssistantRunRow = typeof schema.assistantExecutionRuns.$inferSelect;
type ProviderRow = typeof schema.providers.$inferSelect;

describe('model pricing repository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes models.dev prices and backfills assistant run costs', async () => {
    const database = pricingDatabase();
    database.rows.providers.push(providerRow({ id: 'provider_1', presetId: 'openai' }));
    database.rows.assistantRuns.push(
      assistantRunRow({
        id: 'run_1',
        providerId: 'provider_1',
        providerName: 'OpenAI',
        modelName: 'gpt-5-mini',
        inputTokens: 1_000,
        outputTokens: 500,
      }),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        openai: {
          models: {
            'gpt-5-mini': {
              cost: {
                input: 2,
                output: 8,
              },
            },
          },
        },
      }),
    );

    const result = await refreshModelsDevPrices(database.store);

    expect(result).toEqual({ refreshed: true, recordCount: 1, reason: 'updated' });
    expect(database.rows.modelPrices).toMatchObject([
      {
        id: 'openai:gpt-5-mini',
        providerId: 'openai',
        modelId: 'gpt-5-mini',
        inputCostPerMillion: 2,
        outputCostPerMillion: 8,
      },
    ]);
    expect(database.rows.assistantRuns[0]).toMatchObject({
      estimatedCostMicros: 6000,
      currency: 'USD',
    });
  });

  it.each([
    {
      name: 'non-numeric cost',
      body: { openai: { models: { model: { cost: { input: '2' } } } } },
    },
  ])('rejects a malformed models.dev $name without writing prices', async ({ body }) => {
    const database = pricingDatabase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body));

    await expect(refreshModelsDevPrices(database.store)).rejects.toThrow('models.dev 响应解析失败');
    expect(database.rows.modelPrices).toEqual([]);
    expect(database.rows.assistantRuns).toEqual([]);
  });
});

function pricingDatabase() {
  const rows = {
    modelPrices: [] as ModelPriceRow[],
    assistantRuns: [] as AssistantRunRow[],
    providers: [] as ProviderRow[],
  };
  const metrics = { modelPriceReads: 0 };
  const store = {
    rows,
    select: (fields?: Record<string, unknown>) => selectQuery(rows, metrics, fields),
    insert: (table: unknown) => insertQuery(rows, table),
    update: (table: unknown) => updateQuery(rows, table),
    transaction: (run: (tx: StoreDatabase) => unknown) => run(store as unknown as StoreDatabase),
  };
  return { metrics, rows, store: store as unknown as StoreDatabase };
}

function selectQuery(
  rows: ReturnType<typeof pricingDatabase>['rows'],
  metrics: ReturnType<typeof pricingDatabase>['metrics'],
  fields?: Record<string, unknown>,
) {
  let table: unknown;
  return {
    from(nextTable: unknown) {
      table = nextTable;
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    all() {
      if (table === schema.assistantExecutionRuns) {
        return rows.assistantRuns.filter(
          (run) =>
            run.estimatedCostMicros === null &&
            run.inputTokens !== null &&
            run.outputTokens !== null,
        );
      }
      if (table === schema.providers) return rows.providers;
      if (table === schema.modelPriceRecords) {
        metrics.modelPriceReads += 1;
        return rows.modelPrices;
      }
      return [];
    },
    get() {
      if (table === schema.modelPriceRecords && fields?.fetchedAt) {
        metrics.modelPriceReads += 1;
        const [latest] = rows.modelPrices.toSorted((left, right) =>
          (right.fetchedAt || '').localeCompare(left.fetchedAt || ''),
        );
        return latest ? { fetchedAt: latest.fetchedAt } : undefined;
      }
      if (table === schema.modelPriceRecords) return rows.modelPrices[0];
      return this.all()[0];
    },
  };
}

function insertQuery(rows: ReturnType<typeof pricingDatabase>['rows'], table: unknown) {
  let value: ModelPriceRow | undefined;
  return {
    values(input: ModelPriceRow) {
      value = input;
      return this;
    },
    onConflictDoUpdate() {
      return this;
    },
    run() {
      if (table !== schema.modelPriceRecords || !value) return;
      const index = rows.modelPrices.findIndex((row) => row.id === value?.id);
      if (index >= 0) rows.modelPrices[index] = { ...rows.modelPrices[index], ...value };
      else rows.modelPrices.push(value);
    },
  };
}

function updateQuery(rows: ReturnType<typeof pricingDatabase>['rows'], table: unknown) {
  let value: Partial<AssistantRunRow> = {};
  return {
    set(input: Partial<AssistantRunRow>) {
      value = input;
      return this;
    },
    where() {
      return this;
    },
    run() {
      if (table !== schema.assistantExecutionRuns || rows.assistantRuns.length === 0) return;
      const index = rows.assistantRuns.findIndex((run) => run.estimatedCostMicros === null);
      if (index >= 0) rows.assistantRuns[index] = { ...rows.assistantRuns[index], ...value };
    },
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

function providerRow(input: { id: string; presetId: string }): ProviderRow {
  return {
    id: input.id,
    name: 'OpenAI',
    type: 'openai-chat',
    presetId: input.presetId,
    logo: null,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    apiKeyRef: null,
    modelName: 'gpt-5-mini',
    modelNames: null,
    modelInputMode: null,
    reasoningEffort: null,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  };
}

function assistantRunRow(input: {
  id: string;
  providerId: string;
  providerName: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
}): AssistantRunRow {
  return {
    id: input.id,
    createdAt: '2026-06-02T00:00:00.000Z',
    agentId: 'agent_1',
    agentUsername: null,
    agentNickname: null,
    taskType: 'annotation',
    requestedMode: 'fast_response',
    effectiveMode: 'fast_response',
    providerId: input.providerId,
    providerName: input.providerName,
    modelName: input.modelName,
    status: 'completed',
    fallbackReason: null,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    reasoningTokens: null,
    cachedInputTokens: null,
    cacheWriteTokens: null,
    totalTokens: null,
    estimatedCostMicros: null,
    currency: null,
    durationMs: null,
    stepCount: 0,
    traceJson: null,
  };
}
