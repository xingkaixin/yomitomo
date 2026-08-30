import { rankReadingEvidenceCandidates } from '@yomitomo/core';
import type {
  ReadingEvidence,
  ReadingEvidenceScope,
  ReadingJudgmentResult,
} from '@yomitomo/shared';
import type {
  ReadingLibraryAnswerResult,
  ReadingLibraryContext,
  ReadingLibrarySearchInput,
  ReadingLibrarySession,
} from '../../ipc/reading-memory-domain';
import { hydrateProviderApiKey } from '../providers/provider-repository';
import {
  createReadingMemoryRequests,
  describeReadingMemoryProvider,
  knownReadingMemoryEvidence,
  localReadingJudgment,
  readingMemoryProviderRevision,
  revalidateReadingMemoryEvidence,
  withReadingMemoryRequestContext,
  type ReadingMemoryRequestContext,
  type ReadingMemoryRequestOwner,
} from './reading-memory-request';
import { readReadingLibraryScope, readReadingLibraryScopeIdentity } from './reading-library-scope';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';

const candidateLimit = 24;
const evidenceLimit = 12;

type LibrarySnapshot = { generation: number; result: ReadingLibrarySession };

type ReadingLibraryRuntimeOptions = {
  semanticIndex: Pick<ReadingMemorySemanticIndex, 'search' | 'getStatus'>;
  getAiModule: () => Promise<Pick<typeof import('@yomitomo/ai'), 'runReadingJudgment'>>;
  hydrateProvider?: typeof hydrateProviderApiKey;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
};

export type ReadingLibraryRuntime = ReturnType<typeof createReadingLibraryRuntime>;

export function createReadingLibraryRuntime(options: ReadingLibraryRuntimeOptions) {
  const requests = createReadingMemoryRequests<ReadingLibrarySearchInput, LibrarySnapshot>();
  const { start, assertCurrent, cancel, cancelAll } = requests;
  const hydrateProvider = options.hydrateProvider ?? hydrateProviderApiKey;

  async function context(input: { scope: ReadingEvidenceScope }): Promise<ReadingLibraryContext> {
    try {
      const generation = await withReadingMemoryRequestContext((current) => current.generation);
      const status = await options.semanticIndex.getStatus(input.scope);
      return await withReadingMemoryRequestContext((current) => {
        if (current.generation !== generation) throw sessionExpired();
        return {
          ...libraryContext(current, input.scope),
          ...readReadingLibraryScope(current.executor, input.scope),
          ...status,
        };
      });
    } catch (error) {
      throw safeError(error, 'READING_MEMORY_CONTEXT_FAILED');
    }
  }

  async function search(owner: ReadingMemoryRequestOwner, input: ReadingLibrarySearchInput) {
    const request = start(owner, input);
    const { signal } = request.controller;
    try {
      const initial = await withReadingMemoryRequestContext((current) => ({
        generation: current.generation,
        scope: readReadingLibraryScopeIdentity(current.executor, input.scope).scope,
        providerChanged:
          readingMemoryProviderRevision(current.provider) !== input.expectedRouteRevision,
      }));
      assertCurrent(owner.id, request, signal);
      const found = await options.semanticIndex.search(
        { query: input.question.trim(), scope: initial.scope, limit: candidateLimit },
        { signal },
      );
      assertCurrent(owner.id, request, signal);
      const snapshot = await withReadingMemoryRequestContext((current): LibrarySnapshot => {
        assertCurrent(owner.id, request, signal);
        if (current.generation !== initial.generation) throw sessionExpired();
        const resultContext = {
          ...libraryContext(current, initial.scope),
          ...readReadingLibraryScope(current.executor, initial.scope),
        };
        const evidence = rankReadingEvidenceCandidates(
          revalidateReadingMemoryEvidence(current.executor, found.evidence, resultContext.scope),
          evidenceLimit,
        );
        return {
          generation: initial.generation,
          result: {
            ...found,
            ...resultContext,
            evidence,
            requestId: input.requestId,
            ...(initial.providerChanged ||
            resultContext.routeRevision !== input.expectedRouteRevision
              ? { providerChanged: true }
              : {}),
          },
        };
      });
      assertCurrent(owner.id, request, signal);
      request.snapshot = snapshot;
      options.logInfo?.('reading_memory.library_searched', {
        evidenceCount: snapshot.result.evidence.length,
        mode: snapshot.result.mode,
      });
      return snapshot.result;
    } catch (error) {
      const wasCanceled = signal.aborted;
      if (requests.get(owner.id) === request) cancel(owner.id);
      if (wasCanceled) throw new DOMException('Reading library canceled', 'AbortError');
      options.logInfo?.('reading_memory.library_failed', { stage: 'search' });
      throw safeError(error, 'READING_MEMORY_SEARCH_FAILED');
    }
  }

  async function answer(ownerId: number, requestId: string): Promise<ReadingLibraryAnswerResult> {
    const request = requests.get(ownerId);
    const snapshot = request?.snapshot;
    if (!request || !snapshot || request.input.requestId !== requestId) throw sessionExpired();
    request.controller.abort();
    request.controller = new AbortController();
    const { signal } = request.controller;
    let providerChanged = false;

    const validateCurrent = (
      current: ReadingMemoryRequestContext,
      evidence: readonly ReadingEvidence[],
    ) => {
      assertCurrent(ownerId, request, signal);
      if (current.generation !== snapshot.generation) throw sessionExpired();
      if (!current.remoteConsent) throw new Error('READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED');
      const resultContext = libraryContext(current, snapshot.result.scope);
      return {
        provider: current.provider,
        context: resultContext,
        evidence: revalidateReadingMemoryEvidence(
          current.executor,
          knownReadingMemoryEvidence(snapshot.result.evidence, evidence),
          resultContext.scope,
        ),
      };
    };
    const readCurrent = (evidence: readonly ReadingEvidence[]) =>
      withReadingMemoryRequestContext((current) => validateCurrent(current, evidence));

    const result = async (
      judgment: ReadingJudgmentResult,
      sentProvider: ReadingLibraryAnswerResult['sentProvider'] | null = null,
    ): Promise<ReadingLibraryAnswerResult> => {
      const completed = await withReadingMemoryRequestContext((current) => {
        let after = validateCurrent(current, judgment.evidence);
        if (
          providerChanged ||
          after.context.routeRevision !== request.input.expectedRouteRevision
        ) {
          providerChanged = true;
          after = validateCurrent(current, snapshot.result.evidence);
          judgment = localReadingJudgment('failed', after.evidence, judgment);
        } else {
          const ids = new Set(after.evidence.map((item) => item.id));
          if (judgment.evidence.some((item) => !ids.has(item.id))) {
            judgment = localReadingJudgment('failed', after.evidence, judgment);
          }
        }
        snapshot.result = {
          ...snapshot.result,
          ...after.context,
          ...readReadingLibraryScope(current.executor, after.context.scope),
          evidence: after.evidence,
          ...(providerChanged ? { providerChanged: true as const } : {}),
        };
        return { ...snapshot.result, judgment, ...(sentProvider ? { sentProvider } : {}) };
      });
      assertCurrent(ownerId, request, signal);
      return completed;
    };

    try {
      const before = await readCurrent(snapshot.result.evidence);
      assertCurrent(ownerId, request, signal);
      if (
        snapshot.result.providerChanged ||
        before.context.routeRevision !== request.input.expectedRouteRevision
      ) {
        providerChanged = true;
        return await result(localReadingJudgment('failed', before.evidence));
      }
      if (!before.provider)
        return await result(localReadingJudgment('unconfigured', before.evidence));
      if (before.evidence.length === 0)
        return await result(localReadingJudgment('no_evidence', []));
      const revalidate = async (evidence: readonly ReadingEvidence[]) => {
        const current = await readCurrent(evidence);
        if (current.context.routeRevision !== request.input.expectedRouteRevision) {
          providerChanged = true;
          return [];
        }
        return current.evidence;
      };

      let judgment: ReadingJudgmentResult;
      try {
        const provider = await hydrateProvider(before.provider);
        assertCurrent(ownerId, request, signal);
        const { runReadingJudgment } = await options.getAiModule();
        assertCurrent(ownerId, request, signal);
        judgment = await runReadingJudgment(
          provider,
          { kind: 'library-answer', question: request.input.question },
          before.evidence,
          { signal, revalidateEvidence: revalidate },
        );
      } catch {
        assertCurrent(ownerId, request, signal);
        options.logInfo?.('reading_memory.library_failed', { stage: 'answer' });
        judgment = localReadingJudgment(
          'failed',
          (await readCurrent(snapshot.result.evidence)).evidence,
        );
      }

      assertCurrent(ownerId, request, signal);
      const sentProvider =
        judgment.sentEvidenceCount > 0 ? describeReadingMemoryProvider(before.provider) : null;
      return await result(judgment, sentProvider);
    } catch (error) {
      assertCurrent(ownerId, request, signal);
      throw safeError(error, 'READING_MEMORY_ANSWER_FAILED');
    }
  }

  return {
    context,
    search,
    answer,
    cancel,
    cancelAll,
  };
}

function libraryContext(current: ReadingMemoryRequestContext, scope: ReadingEvidenceScope) {
  return {
    ...readReadingLibraryScopeIdentity(current.executor, scope),
    provider: describeReadingMemoryProvider(current.provider),
    routeRevision: readingMemoryProviderRevision(current.provider),
    remoteConsentRequired: !current.remoteConsent,
  };
}

function sessionExpired() {
  return new Error('READING_MEMORY_SESSION_EXPIRED');
}

function safeError(error: unknown, fallback: string) {
  if (
    error instanceof Error &&
    [
      'APP_LOCK_REQUIRED',
      'READING_MEMORY_SCOPE_NOT_FOUND',
      'READING_MEMORY_SESSION_EXPIRED',
      'READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED',
    ].includes(error.message)
  )
    return error;
  return new Error(fallback);
}
