import { eq } from 'drizzle-orm';
import { selectReadingRelationEvidence } from '@yomitomo/core';
import type { LlmProvider, ReadingEvidence, ReadingJudgmentResult } from '@yomitomo/shared';
import type {
  ReadingRelationsJudgeResult,
  ReadingRelationsSearchInput,
  ReadingRelationsSession,
} from '../../ipc/reading-memory-domain';
import * as schema from '../db/schema';
import { assertAppLockSettingsUnlocked } from '../ipc/ipc';
import { hydrateProviderApiKey } from '../providers/provider-repository';
import { upsertSettings } from '../store/settings-repository';
import { getDatabase, withDatabaseLease } from '../store/store-db';
import { rowToSettings } from '../store/store-normalizers';
import {
  createReadingMemoryRequests,
  describeReadingMemoryProvider as describeProvider,
  knownReadingMemoryEvidence as knownEvidence,
  localReadingJudgment as localJudgment,
  readingMemoryProviderRevision as providerIdentity,
  revalidateReadingMemoryEvidence,
  withReadingMemoryRequestContext,
  type ReadingMemoryRequestContext,
  type ReadingMemoryRequestOwner,
} from './reading-memory-request';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';

const libraryScope = { kind: 'library' } as const;
const candidateLimit = 24;

type ReadingJudgmentModule = Pick<typeof import('@yomitomo/ai'), 'runReadingJudgment'>;

type ReadingRelationsRuntimeOptions = {
  semanticIndex: Pick<ReadingMemorySemanticIndex, 'search'>;
  getAiModule: () => Promise<ReadingJudgmentModule>;
  hydrateProvider?: typeof hydrateProviderApiKey;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
};

type RelationsSnapshot = {
  generation: number;
  providerIdentity: string;
  result: ReadingRelationsSession;
};

export type ReadingRelationsRuntime = ReturnType<typeof createReadingRelationsRuntime>;

export function createReadingRelationsRuntime(options: ReadingRelationsRuntimeOptions) {
  const requests = createReadingMemoryRequests<ReadingRelationsSearchInput, RelationsSnapshot>();
  const { start, assertCurrent, cancel, cancelAll } = requests;
  const hydrateProvider = options.hydrateProvider ?? hydrateProviderApiKey;

  async function search(owner: ReadingMemoryRequestOwner, input: ReadingRelationsSearchInput) {
    const request = start(owner, input);
    const { signal } = request.controller;
    try {
      const generation = await withRelationsDatabase(input, (context) => context.generation);
      assertCurrent(owner.id, request, signal);
      const found = await options.semanticIndex.search(
        {
          query: [input.context.quote.trim(), input.question?.trim()].filter(Boolean).join('\n'),
          scope: libraryScope,
          limit: candidateLimit,
        },
        { signal },
      );
      assertCurrent(owner.id, request, signal);
      const snapshot = await withRelationsDatabase(input, (context): RelationsSnapshot => {
        assertCurrent(owner.id, request, signal);
        if (context.generation !== generation) throw sessionExpired();
        const evidence = selectReadingRelationEvidence(
          revalidateReadingMemoryEvidence(context.executor, found.evidence, libraryScope),
          input,
        );
        return {
          generation,
          providerIdentity: providerIdentity(context.provider),
          result: {
            ...found,
            requestId: input.requestId,
            evidence,
            provider: describeProvider(context.provider),
            remoteConsentRequired: !context.remoteConsent,
          },
        };
      });
      assertCurrent(owner.id, request, signal);
      request.snapshot = snapshot;
      options.logInfo?.('reading_memory.relations_searched', {
        evidenceCount: snapshot.result.evidence.length,
        mode: snapshot.result.mode,
      });
      return snapshot.result;
    } catch (error) {
      const wasCanceled = signal.aborted;
      if (requests.get(owner.id) === request) cancel(owner.id);
      if (wasCanceled) throw new DOMException('Reading relations canceled', 'AbortError');
      options.logInfo?.('reading_memory.relations_failed', { stage: 'search' });
      throw safeRequestError(error, 'READING_MEMORY_SEARCH_FAILED');
    }
  }

  async function judge(ownerId: number, requestId: string): Promise<ReadingRelationsJudgeResult> {
    const request = requests.get(ownerId);
    const snapshot = request?.snapshot;
    if (!request || !snapshot || request.input.requestId !== requestId) throw sessionExpired();
    request.controller.abort();
    request.controller = new AbortController();
    const { signal } = request.controller;
    let providerChanged = false;

    const readCurrent = (evidence: readonly ReadingEvidence[]) =>
      withRelationsDatabase(request.input, (context) => {
        assertCurrent(ownerId, request, signal);
        if (context.generation !== snapshot.generation) throw sessionExpired();
        if (!context.remoteConsent) throw new Error('READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED');
        const current = revalidateReadingMemoryEvidence(
          context.executor,
          knownEvidence(snapshot.result.evidence, evidence),
          libraryScope,
        );
        return { ...context, evidence: current };
      });

    const before = await readCurrent(snapshot.result.evidence);
    assertCurrent(ownerId, request, signal);
    if (providerIdentity(before.provider) !== snapshot.providerIdentity) {
      return changedProviderResult(snapshot, before.provider, before.evidence);
    }

    const revalidate = async (evidence: readonly ReadingEvidence[]) => {
      const current = await readCurrent(evidence);
      if (providerIdentity(current.provider) !== snapshot.providerIdentity) {
        providerChanged = true;
        return [];
      }
      return current.evidence;
    };

    let judgment: ReadingJudgmentResult;
    try {
      const provider = before.provider ? await hydrateProvider(before.provider) : undefined;
      assertCurrent(ownerId, request, signal);
      const { runReadingJudgment } = await options.getAiModule();
      assertCurrent(ownerId, request, signal);
      judgment = await runReadingJudgment(
        provider,
        {
          kind: 'reading-relations',
          selection: request.input.context.quote,
          paragraph: request.input.context.nearbyText,
          question: request.input.question,
        },
        before.evidence,
        { signal, revalidateEvidence: revalidate },
      );
    } catch {
      assertCurrent(ownerId, request, signal);
      options.logInfo?.('reading_memory.relations_failed', { stage: 'judge' });
      judgment = localJudgment('failed', (await readCurrent(snapshot.result.evidence)).evidence);
    }
    assertCurrent(ownerId, request, signal);
    const after = await readCurrent(judgment.evidence);
    assertCurrent(ownerId, request, signal);
    const sentProvider = judgment.sentEvidenceCount > 0 ? describeProvider(before.provider) : null;
    if (providerChanged || providerIdentity(after.provider) !== snapshot.providerIdentity) {
      const current = await readCurrent(snapshot.result.evidence);
      return {
        ...changedProviderResult(snapshot, current.provider, current.evidence, judgment),
        ...(sentProvider ? { sentProvider } : {}),
      };
    }
    const currentIds = new Set(after.evidence.map((item) => item.id));
    if (judgment.evidence.some((item) => !currentIds.has(item.id))) {
      judgment = localJudgment('failed', after.evidence, judgment);
    }
    snapshot.result = {
      ...snapshot.result,
      evidence: after.evidence,
      provider: describeProvider(after.provider),
      remoteConsentRequired: false,
    };
    return { ...snapshot.result, judgment, ...(sentProvider ? { sentProvider } : {}) };
  }

  return {
    search,
    judge,
    cancel,
    cancelAll,
    confirmPrivacy: () =>
      withDatabaseLease(async () => {
        const database = getDatabase();
        const settings = rowToSettings(database.select().from(schema.appSettings).limit(1).get());
        assertAppLockSettingsUnlocked(settings);
        upsertSettings(database, { readingMemoryRemoteConsent: true });
      }),
  };
}

function withRelationsDatabase<T>(
  input: ReadingRelationsSearchInput,
  operation: (context: ReadingMemoryRequestContext) => T,
): Promise<T> {
  return withReadingMemoryRequestContext((context) => {
    const database = getDatabase();
    const article = database
      .select({ sourceType: schema.articles.sourceType })
      .from(schema.articles)
      .where(eq(schema.articles.id, input.articleId))
      .get();
    if (!article || article.sourceType !== input.context.sourceType) throw sessionExpired();
    return operation(context);
  });
}

function changedProviderResult(
  snapshot: RelationsSnapshot,
  provider: LlmProvider | undefined,
  evidence: ReadingEvidence[],
  previousJudgment?: ReadingJudgmentResult,
): ReadingRelationsJudgeResult {
  snapshot.providerIdentity = providerIdentity(provider);
  snapshot.result = {
    ...snapshot.result,
    evidence,
    provider: describeProvider(provider),
    remoteConsentRequired: false,
  };
  return {
    ...snapshot.result,
    judgment: localJudgment('failed', evidence, previousJudgment),
    providerChanged: true,
  };
}

function sessionExpired() {
  return new Error('READING_MEMORY_SESSION_EXPIRED');
}

function safeRequestError(error: unknown, message: string) {
  if (error instanceof Error && error.message === 'APP_LOCK_REQUIRED') return error;
  return new Error(message);
}
