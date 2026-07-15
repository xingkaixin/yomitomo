import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cause, Effect, Exit, Fiber } from 'effect';
import * as schema from '../db/schema';
import { modelPricingRepositoryTestApi, refreshModelsDevPrices } from './model-pricing-repository';
import type { StoreDatabase } from '../store/store-db';

function noop() {}

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

  it('uses the fresh cache path without fetching remote prices', async () => {
    const database = pricingDatabase();
    database.rows.providers.push(providerRow({ id: 'provider_1', presetId: 'openai' }));
    database.rows.modelPrices.push(
      modelPriceRow({
        id: 'openai:gpt-5-mini',
        providerId: 'openai',
        modelId: 'gpt-5-mini',
        fetchedAt: new Date().toISOString(),
        inputCostPerMillion: 1,
        outputCostPerMillion: 2,
      }),
    );
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));

    const result = await refreshModelsDevPrices(database.store);

    expect(result).toEqual({ refreshed: false, recordCount: 0, reason: 'fresh_cache' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(database.rows.assistantRuns[0].estimatedCostMicros).toBe(2000);
  });

  it('rejects with the models.dev HTTP error without writing prices', async () => {
    const database = pricingDatabase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 502 }));

    await expect(refreshModelsDevPrices(database.store)).rejects.toThrow('models.dev 返回 502');
    expect(database.rows.modelPrices).toEqual([]);
  });

  it('maps fetch AbortError to a timeout error', async () => {
    const database = pricingDatabase();
    const error = new Error('aborted');
    error.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);

    await expect(refreshModelsDevPrices(database.store)).rejects.toThrow('models.dev 请求超时');
    expect(database.rows.modelPrices).toEqual([]);
  });

  it('rejects with a response parse error without writing prices', async () => {
    const database = pricingDatabase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-json', {
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(refreshModelsDevPrices(database.store)).rejects.toThrow('models.dev 响应解析失败');
    expect(database.rows.modelPrices).toEqual([]);
  });

  it.each([
    { name: 'array root', body: [{}] },
    { name: 'array models record', body: { openai: { models: [] } } },
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

  it('keeps malformed catalogue payloads in the typed parse failure channel', async () => {
    const database = pricingDatabase();
    database.rows.providers.push(providerRow({ id: 'provider_1', presetId: 'openai' }));
    database.rows.modelPrices.push(
      modelPriceRow({
        id: 'openai:gpt-5-mini',
        providerId: 'openai',
        modelId: 'gpt-5-mini',
        fetchedAt: new Date(0).toISOString(),
        inputCostPerMillion: 1,
        outputCostPerMillion: 2,
      }),
    );
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ openai: null }));

    const exit = await Effect.runPromiseExit(
      modelPricingRepositoryTestApi.refreshModelsDevPricesEffect(database.store),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;

    expect(Cause.hasFails(exit.cause)).toBe(true);
    expect(Cause.hasDies(exit.cause)).toBe(false);
    expect(Cause.squash(exit.cause)).toMatchObject({
      message: expect.stringContaining('models.dev 响应解析失败'),
    });
    expect(database.rows.modelPrices).toHaveLength(1);
    expect(database.rows.assistantRuns[0]?.estimatedCostMicros).toBeNull();
  });

  it('aborts models.dev fetch when its Effect is interrupted', async () => {
    const database = pricingDatabase();
    const request = hangingFetch();
    vi.spyOn(globalThis, 'fetch').mockImplementation(request.run);
    const fiber = Effect.runFork(
      modelPricingRepositoryTestApi.refreshModelsDevPricesEffect(database.store),
    );

    await request.started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const aborted = request.aborted();
    request.release();

    expect(aborted).toBe(true);
  });
});

function hangingFetch() {
  const started = deferredPromise();
  let signal: AbortSignal | undefined;
  let rejectRequest: (reason?: unknown) => void = noop;
  return {
    started,
    run: (_input: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        signal = init?.signal instanceof AbortSignal ? init.signal : undefined;
        rejectRequest = reject;
        started.resolve();
      }),
    aborted: () => signal?.aborted === true,
    release: () => rejectRequest(new DOMException('Aborted', 'AbortError')),
  };
}

function deferredPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolve = noop;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function pricingDatabase() {
  const rows = {
    modelPrices: [] as ModelPriceRow[],
    assistantRuns: [] as AssistantRunRow[],
    providers: [] as ProviderRow[],
  };
  const store = {
    rows,
    select: (fields?: Record<string, unknown>) => selectQuery(rows, fields),
    insert: (table: unknown) => insertQuery(rows, table),
    update: (table: unknown) => updateQuery(rows, table),
    transaction: (run: (tx: StoreDatabase) => unknown) => run(store as unknown as StoreDatabase),
  };
  return { rows, store: store as unknown as StoreDatabase };
}

function selectQuery(
  rows: ReturnType<typeof pricingDatabase>['rows'],
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
      if (table === schema.modelPriceRecords) return rows.modelPrices;
      return [];
    },
    get() {
      if (table === schema.modelPriceRecords && fields?.fetchedAt) {
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
      rows.assistantRuns[0] = { ...rows.assistantRuns[0], ...value };
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

function modelPriceRow(input: {
  id: string;
  providerId: string;
  modelId: string;
  fetchedAt: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}): ModelPriceRow {
  return {
    id: input.id,
    providerId: input.providerId,
    modelId: input.modelId,
    inputCostPerMillion: input.inputCostPerMillion,
    outputCostPerMillion: input.outputCostPerMillion,
    cacheReadCostPerMillion: null,
    cacheWriteCostPerMillion: null,
    currency: 'USD',
    source: 'models.dev',
    fetchedAt: input.fetchedAt,
    updatedAt: input.fetchedAt,
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
