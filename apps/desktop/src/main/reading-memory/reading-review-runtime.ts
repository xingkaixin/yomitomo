import { createHash } from 'node:crypto';
import { rankReadingEvidenceCandidates } from '@yomitomo/core';
import type {
  ReadingEvidence,
  ReadingJudgmentResult,
  ReadingReviewAssetRef,
} from '@yomitomo/shared';
import {
  readingReviewAnswerLimit,
  type ReadingReviewEvidenceSearchInput,
  type ReadingReviewEvidenceSession,
  type ReadingReviewEvidenceResult,
  type ReadingReviewHistoryCursor,
  type ReadingReviewQueue,
  type ReadingReviewRevealResult,
  type ReadingReviewSession,
  type ReadingReviewStartInput,
  type ReadingReviewSubmitInput,
  type ReadingReviewSubmitResult,
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
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';
import { readReadingReviewAsset, type ReadingReviewAsset } from './reading-review-source';
import { appendReadingReview, readReadingReviewHistory } from './reading-review-store';
import { readingReviewQueueItem } from './reading-review-queue';

const libraryScope = { kind: 'library' } as const;
const candidateLimit = 24;
const evidenceLimit = 6;
const queryCharacterLimit = 10_000;

type ReviewComparison = {
  input: ReadingReviewEvidenceSearchInput;
  controller: AbortController;
  session?: ReadingReviewEvidenceSession;
};
type ReviewSnapshot = {
  generation: number;
  asset: ReadingReviewAsset;
  answer?: string;
  comparison?: ReviewComparison;
};
type ReadingReviewRuntimeOptions = {
  semanticIndex: Pick<ReadingMemorySemanticIndex, 'search'>;
  readQueue: () => Promise<ReadingReviewQueue>;
  getAiModule: () => Promise<Pick<typeof import('@yomitomo/ai'), 'runReadingJudgment'>>;
  hydrateProvider?: typeof hydrateProviderApiKey;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
};

export type ReadingReviewRuntime = ReturnType<typeof createReadingReviewRuntime>;

export function createReadingReviewRuntime(options: ReadingReviewRuntimeOptions) {
  const requests = createReadingMemoryRequests<ReadingReviewStartInput, ReviewSnapshot>();
  const hydrateProvider = options.hydrateProvider ?? hydrateProviderApiKey;
  type Request = NonNullable<ReturnType<typeof requests.get>>;

  function getRequest(ownerId: number, requestId: string) {
    const request = requests.get(ownerId);
    if (!request?.snapshot || request.input.requestId !== requestId) throw sessionExpired();
    return request;
  }

  async function withSnapshot<T>(
    ownerId: number,
    request: Request,
    operation: (
      current: ReadingMemoryRequestContext,
      asset: ReadingReviewAsset,
      snapshot: ReviewSnapshot,
    ) => T,
  ): Promise<T> {
    const snapshot = request.snapshot;
    if (!snapshot) throw sessionExpired();
    const { signal } = request.controller;
    try {
      const result = await withReadingMemoryRequestContext((current) => {
        requests.assertCurrent(ownerId, request, signal);
        const asset = currentAsset(current, snapshot);
        return operation(current, asset, snapshot);
      });
      requests.assertCurrent(ownerId, request, signal);
      return result;
    } catch (error) {
      requests.assertCurrent(ownerId, request, signal);
      throw safeError(error);
    }
  }

  function cancel(ownerId: number, requestId: string, comparisonId?: string) {
    const request = requests.get(ownerId);
    if (!request || request.input.requestId !== requestId) return;
    if (comparisonId === undefined) {
      requests.cancel(ownerId, requestId);
      return;
    }
    const comparison = request.snapshot?.comparison;
    if (comparison?.input.comparisonId !== comparisonId) return;
    comparison.controller.abort();
    if (request.snapshot) request.snapshot.comparison = undefined;
  }

  async function start(owner: ReadingMemoryRequestOwner, input: ReadingReviewStartInput) {
    const request = requests.start(owner, input);
    const { signal } = request.controller;
    try {
      const opened = await withReadingMemoryRequestContext((current) => {
        requests.assertCurrent(owner.id, request, signal);
        const asset = readReadingReviewAsset(current.executor, input.asset);
        if (!asset) throw conflict();
        return {
          snapshot: { generation: current.generation, asset } satisfies ReviewSnapshot,
          session: blindSession(input.requestId, asset, current),
        };
      });
      requests.assertCurrent(owner.id, request, signal);
      request.snapshot = opened.snapshot;
      return opened.session;
    } catch (error) {
      const wasCanceled = signal.aborted;
      if (requests.get(owner.id) === request) requests.cancel(owner.id);
      if (wasCanceled) throw new DOMException('Reading review canceled', 'AbortError');
      throw safeError(error);
    }
  }

  async function reveal(
    ownerId: number,
    input: { requestId: string; answer: string },
  ): Promise<ReadingReviewRevealResult> {
    const request = getRequest(ownerId, input.requestId);
    const answer = input.answer.trim();
    if (answer.length > readingReviewAnswerLimit) throw new Error('READING_REVIEW_INVALID_ANSWER');
    return withSnapshot(ownerId, request, (current, asset, snapshot) => {
      if (snapshot.answer !== undefined && snapshot.answer !== answer) throw conflict();
      snapshot.answer = answer;
      return {
        ...blindSession(input.requestId, asset, current),
        answer,
        currentJudgment: asset.current.content,
        baseJudgment: asset.base.content,
        history: readReadingReviewHistory(current.executor, request.input.asset),
        sourceTarget: { articleId: asset.base.articleId, annotationId: asset.base.annotationId },
      };
    });
  }

  async function history(
    ownerId: number,
    input: { requestId: string; cursor?: ReadingReviewHistoryCursor },
  ) {
    const request = getRequest(ownerId, input.requestId);
    return withSnapshot(ownerId, request, (current, _asset, snapshot) => {
      if (snapshot.answer === undefined) throw sessionExpired();
      return readReadingReviewHistory(current.executor, request.input.asset, input.cursor);
    });
  }

  async function submit(
    ownerId: number,
    input: ReadingReviewSubmitInput,
  ): Promise<ReadingReviewSubmitResult> {
    const request = getRequest(ownerId, input.requestId);
    const snapshot = request.snapshot!;
    if (snapshot.answer === undefined) throw sessionExpired();
    const { signal } = request.controller;
    try {
      const result = await withReadingMemoryRequestContext((current) => {
        requests.assertCurrent(ownerId, request, signal);
        if (current.generation !== snapshot.generation) throw sessionExpired();
        const { event } = appendReadingReview(current.executor, {
          id: input.eventId,
          asset: request.input.asset,
          assetVersion: snapshot.asset.base.assetVersion,
          judgmentDigest: digest(snapshot.asset.current.content),
          headReviewId: snapshot.asset.current.latestReview?.id ?? null,
          decision: input.decision,
          answer: snapshot.answer!,
        });
        snapshot.comparison?.controller.abort();
        snapshot.comparison = undefined;
        return { requestId: input.requestId, event };
      });
      requests.assertCurrent(ownerId, request, signal);
      return result;
    } catch (error) {
      requests.assertCurrent(ownerId, request, signal);
      throw safeError(error);
    }
  }

  async function searchEvidence(ownerId: number, input: ReadingReviewEvidenceSearchInput) {
    const request = getRequest(ownerId, input.requestId);
    const snapshot = request.snapshot!;
    if (snapshot.answer === undefined) throw sessionExpired();
    const previous = snapshot.comparison;
    if (previous?.input.comparisonId === input.comparisonId) throw sessionExpired();
    previous?.controller.abort();
    const comparison: ReviewComparison = { input, controller: new AbortController() };
    snapshot.comparison = comparison;
    const signal = AbortSignal.any([request.controller.signal, comparison.controller.signal]);
    const assertCurrent = () => {
      requests.assertCurrent(ownerId, request, signal);
      if (snapshot.comparison !== comparison) throw sessionExpired();
    };
    try {
      const initial = await withSnapshot(ownerId, request, (current, asset) => {
        assertCurrent();
        return {
          query: asset.current.content.slice(0, queryCharacterLimit),
          routeRevision: readingMemoryProviderRevision(current.provider),
        };
      });
      assertCurrent();
      const found = await options.semanticIndex.search(
        { query: initial.query, scope: libraryScope, limit: candidateLimit },
        { signal },
      );
      assertCurrent();
      const session = await withSnapshot(ownerId, request, (current) => {
        assertCurrent();
        const provider = providerContext(current);
        const evidence = rankReadingEvidenceCandidates(
          newerEvidence(
            snapshot,
            revalidateReadingMemoryEvidence(current.executor, found.evidence, libraryScope),
          ),
          evidenceLimit,
        );
        return {
          ...found,
          ...provider,
          requestId: input.requestId,
          comparisonId: input.comparisonId,
          evidence,
          ...(initial.routeRevision !== input.expectedRouteRevision ||
          provider.routeRevision !== input.expectedRouteRevision
            ? { providerChanged: true as const }
            : {}),
        };
      });
      assertCurrent();
      comparison.session = session;
      options.logInfo?.('reading_memory.review_evidence_searched', {
        evidenceCount: session.evidence.length,
        mode: session.mode,
      });
      return session;
    } catch (error) {
      const wasCanceled = signal.aborted;
      if (requests.get(ownerId) === request && snapshot.comparison === comparison)
        cancel(ownerId, input.requestId, input.comparisonId);
      if (wasCanceled) throw new DOMException('Reading review comparison canceled', 'AbortError');
      options.logInfo?.('reading_memory.review_failed', { stage: 'search_evidence' });
      throw safeError(error);
    }
  }

  async function compareEvidence(
    ownerId: number,
    input: { requestId: string; comparisonId: string },
  ): Promise<ReadingReviewEvidenceResult> {
    const request = getRequest(ownerId, input.requestId);
    const snapshot = request.snapshot!;
    const comparison = snapshot.comparison;
    if (!comparison?.session || comparison.input.comparisonId !== input.comparisonId)
      throw sessionExpired();
    comparison.controller.abort();
    comparison.controller = new AbortController();
    const signal = AbortSignal.any([request.controller.signal, comparison.controller.signal]);
    let providerChanged = Boolean(comparison.session.providerChanged);
    const assertCurrent = () => {
      requests.assertCurrent(ownerId, request, signal);
      if (snapshot.comparison !== comparison) throw sessionExpired();
    };
    const revalidate = (
      current: ReadingMemoryRequestContext,
      supplied: readonly ReadingEvidence[],
    ) =>
      newerEvidence(
        snapshot,
        revalidateReadingMemoryEvidence(
          current.executor,
          knownReadingMemoryEvidence(comparison.session!.evidence, supplied),
          libraryScope,
        ),
      );
    const read = (supplied: readonly ReadingEvidence[]) =>
      withSnapshot(ownerId, request, (current) => {
        assertCurrent();
        if (!current.remoteConsent) throw new Error('READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED');
        const route = providerContext(current);
        providerChanged ||= route.routeRevision !== comparison.input.expectedRouteRevision;
        return { provider: current.provider, route, evidence: revalidate(current, supplied) };
      });
    const finish = async (
      judgment: ReadingJudgmentResult,
      sentProvider: ReadingReviewEvidenceResult['sentProvider'] | null = null,
    ): Promise<ReadingReviewEvidenceResult> => {
      const result = await withSnapshot(ownerId, request, (current) => {
        assertCurrent();
        if (!current.remoteConsent) throw new Error('READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED');
        const route = providerContext(current);
        providerChanged ||= route.routeRevision !== comparison.input.expectedRouteRevision;
        const evidence = revalidate(
          current,
          providerChanged ? comparison.session!.evidence : judgment.evidence,
        );
        const ids = new Set(evidence.map((item) => item.id));
        if (providerChanged || judgment.evidence.some((item) => !ids.has(item.id)))
          judgment = localReadingJudgment('failed', evidence, judgment);
        comparison.session = {
          ...comparison.session!,
          ...route,
          evidence,
          ...(providerChanged ? { providerChanged: true as const } : {}),
        };
        return { ...comparison.session, judgment, ...(sentProvider ? { sentProvider } : {}) };
      });
      assertCurrent();
      return result;
    };
    try {
      const before = await read(comparison.session.evidence);
      assertCurrent();
      if (providerChanged) return await finish(localReadingJudgment('failed', before.evidence));
      if (!before.provider)
        return await finish(localReadingJudgment('unconfigured', before.evidence));
      if (before.evidence.length === 0)
        return await finish(localReadingJudgment('no_evidence', []));
      let judgment: ReadingJudgmentResult;
      try {
        const provider = await hydrateProvider(before.provider);
        assertCurrent();
        const { runReadingJudgment } = await options.getAiModule();
        assertCurrent();
        judgment = await runReadingJudgment(
          provider,
          { kind: 'evidence-comparison', judgment: snapshot.asset.current.content },
          before.evidence,
          {
            signal,
            revalidateEvidence: async (supplied) => {
              const current = await read(supplied);
              assertCurrent();
              return providerChanged ? [] : current.evidence;
            },
          },
        );
      } catch {
        assertCurrent();
        options.logInfo?.('reading_memory.review_failed', { stage: 'compare_evidence' });
        judgment = localReadingJudgment(
          'failed',
          (await read(comparison.session.evidence)).evidence,
        );
      }
      assertCurrent();
      const sentProvider =
        judgment.sentEvidenceCount > 0 ? describeReadingMemoryProvider(before.provider) : null;
      return await finish(judgment, sentProvider);
    } catch (error) {
      assertCurrent();
      throw safeError(error);
    }
  }

  return {
    queue: options.readQueue,
    start,
    reveal,
    history,
    submit,
    cancel,
    searchEvidence,
    compareEvidence,
    cancelAll: requests.cancelAll,
  };
}

function currentAsset(current: ReadingMemoryRequestContext, snapshot: ReviewSnapshot) {
  if (current.generation !== snapshot.generation) throw sessionExpired();
  const asset = readReadingReviewAsset(current.executor, assetRef(snapshot.asset));
  if (
    !asset ||
    asset.base.assetVersion !== snapshot.asset.base.assetVersion ||
    asset.current.content !== snapshot.asset.current.content ||
    (asset.current.latestReview?.id ?? null) !== (snapshot.asset.current.latestReview?.id ?? null)
  )
    throw conflict();
  return asset;
}

function blindSession(
  requestId: string,
  asset: ReadingReviewAsset,
  current: ReadingMemoryRequestContext,
): ReadingReviewSession {
  return {
    ...readingReviewQueueItem(asset),
    requestId,
    ...providerContext(current),
  };
}

function assetRef(asset: ReadingReviewAsset): ReadingReviewAssetRef {
  const { articleId, annotationId, assetType, assetId } = asset.base;
  return { articleId, annotationId, assetType, assetId };
}

function providerContext(current: ReadingMemoryRequestContext) {
  return {
    provider: describeReadingMemoryProvider(current.provider),
    routeRevision: readingMemoryProviderRevision(current.provider),
    remoteConsentRequired: !current.remoteConsent,
  };
}

function newerEvidence(snapshot: ReviewSnapshot, evidence: ReadingEvidence[]) {
  const since = Date.parse(
    snapshot.asset.current.latestReview?.createdAt ?? snapshot.asset.base.formedAt,
  );
  return evidence.filter(
    (item) =>
      Date.parse(item.createdAt) > since &&
      !(
        item.source.ref.id === snapshot.asset.base.articleId &&
        item.location.annotationId === snapshot.asset.base.annotationId
      ),
  );
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function conflict() {
  return new Error('READING_REVIEW_CONFLICT');
}

function sessionExpired() {
  return new Error('READING_MEMORY_SESSION_EXPIRED');
}

function safeError(error: unknown) {
  if (
    error instanceof Error &&
    [
      'APP_LOCK_REQUIRED',
      'READING_REVIEW_CONFLICT',
      'READING_REVIEW_INVALID_ANSWER',
      'READING_MEMORY_SESSION_EXPIRED',
      'READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED',
    ].includes(error.message)
  )
    return error;
  return new Error('READING_REVIEW_FAILED');
}
