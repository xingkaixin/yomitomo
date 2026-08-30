import { createHash } from 'node:crypto';
import type { WebContents } from 'electron';
import type {
  LlmProvider,
  ReadingEvidence,
  ReadingEvidenceScope,
  ReadingJudgmentResult,
} from '@yomitomo/shared';
import type { ReadingMemoryProviderDescriptor } from '../../ipc/reading-memory-domain';
import { taskProviderRoute } from '../agents/agent-runtime-routing';
import * as schema from '../db/schema';
import { assertAppLockSettingsUnlocked } from '../ipc/ipc';
import {
  getDatabase,
  getSqliteExecutor,
  readDatabaseLifecycle,
  withDatabaseLease,
} from '../store/store-db';
import { rowToProvider, rowToSettings } from '../store/store-normalizers';
import { materializeReadingEvidenceCandidates } from './reading-memory-evidence-search';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

export type ReadingMemoryRequestOwner = Pick<WebContents, 'id' | 'isDestroyed' | 'once' | 'off'>;

export function createReadingMemoryRequests<Input extends { requestId: string }, Snapshot>() {
  type Request = {
    input: Input;
    controller: AbortController;
    snapshot?: Snapshot;
    release: () => void;
  };
  const requests = new Map<number, Request>();

  function cancel(ownerId: number, requestId?: string) {
    const request = requests.get(ownerId);
    if (!request || (requestId !== undefined && request.input.requestId !== requestId)) return;
    requests.delete(ownerId);
    request.controller.abort();
    request.release();
  }

  function start(owner: ReadingMemoryRequestOwner, input: Input) {
    cancel(owner.id);
    if (owner.isDestroyed()) throw new Error('READING_MEMORY_SESSION_EXPIRED');
    const onDestroyed = () => cancel(owner.id);
    const request: Request = {
      input,
      controller: new AbortController(),
      release: () => owner.off('destroyed', onDestroyed),
    };
    requests.set(owner.id, request);
    owner.once('destroyed', onDestroyed);
    return request;
  }

  return {
    start,
    get: (ownerId: number) => requests.get(ownerId),
    assertCurrent: (ownerId: number, request: Request, signal: AbortSignal) => {
      signal.throwIfAborted();
      if (requests.get(ownerId) !== request) throw new Error('READING_MEMORY_SESSION_EXPIRED');
    },
    cancel,
    cancelAll: () => {
      for (const ownerId of requests.keys()) cancel(ownerId);
    },
  };
}

export type ReadingMemoryRequestContext = {
  executor: ReadingMemorySqliteExecutor;
  generation: number;
  provider: LlmProvider | undefined;
  remoteConsent: boolean;
};

export function withReadingMemoryRequestContext<T>(
  operation: (context: ReadingMemoryRequestContext) => T,
): Promise<T> {
  return withDatabaseLease(async () => {
    const database = getDatabase();
    const settings = rowToSettings(database.select().from(schema.appSettings).limit(1).get());
    assertAppLockSettingsUnlocked(settings);
    const providers = database.select().from(schema.providers).all().map(rowToProvider);
    return operation({
      executor: getSqliteExecutor(),
      generation: readDatabaseLifecycle().generation,
      provider: taskProviderRoute(providers, settings, 'readingAssistant'),
      remoteConsent: settings.readingMemoryRemoteConsent,
    });
  });
}

export function revalidateReadingMemoryEvidence(
  executor: ReadingMemorySqliteExecutor,
  evidence: readonly ReadingEvidence[],
  scope: ReadingEvidenceScope,
) {
  return materializeReadingEvidenceCandidates(
    executor,
    evidence.map((item) => ({
      id: item.id,
      articleId: item.source.ref.id,
      targetId: item.location.annotationId,
      sourceVersion: item.sourceVersion,
    })),
    scope,
  );
}

export function knownReadingMemoryEvidence(
  allowed: readonly ReadingEvidence[],
  supplied: readonly ReadingEvidence[],
) {
  const versions = new Map(allowed.map((item) => [item.id, item.sourceVersion]));
  return supplied.filter((item) => versions.get(item.id) === item.sourceVersion);
}

export function describeReadingMemoryProvider(
  provider: LlmProvider | undefined,
): ReadingMemoryProviderDescriptor | null {
  return provider
    ? { id: provider.id, name: provider.name, type: provider.type, modelName: provider.modelName }
    : null;
}

export function readingMemoryProviderRevision(provider: LlmProvider | undefined) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        provider ? [provider.id, provider.type, provider.baseUrl, provider.modelName] : null,
      ),
    )
    .digest('hex');
}

export function localReadingJudgment(
  reason: Extract<ReadingJudgmentResult, { state: 'local' }>['reason'],
  evidence: ReadingEvidence[],
  previousJudgment?: ReadingJudgmentResult,
): ReadingJudgmentResult {
  return {
    state: 'local',
    reason,
    evidence,
    inputTruncated: previousJudgment?.inputTruncated ?? false,
    sentEvidenceCount: previousJudgment?.sentEvidenceCount ?? 0,
  };
}
