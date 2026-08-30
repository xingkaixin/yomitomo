import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingRelationsSession } from '../../../ipc-contract';
import {
  recordReadingMemoryJudgment,
  recordReadingMemoryQuery,
  recordReadingMemoryUsage,
} from './reading-memory-usage';

const recordUsage = vi.fn(async () => undefined);

beforeEach(() => {
  recordUsage.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('yomitomoDesktop', { readingMemory: { recordUsage } });
});

afterEach(() => vi.unstubAllGlobals());

describe('reading memory interaction counts', () => {
  it('sends only fixed keys, never the source, question or evidence supplied to the UI', () => {
    const result = {
      ...session(),
      requestId: 'private-request',
      question: 'private question',
      title: 'private title',
      excerpt: 'private excerpt',
      answer: 'private answer',
    };
    recordReadingMemoryQuery(result);
    expect(recordUsage.mock.calls).toEqual([
      ['query_completed'],
      ['fallback_keyword'],
      ['fallback_no_provider'],
    ]);
    expect(JSON.stringify(recordUsage.mock.calls)).not.toContain('private');
  });

  it('counts partial coverage once while a usable model and the projection are both incomplete', () => {
    const result = session();
    result.mode = 'hybrid';
    result.provider = {
      id: 'provider-id',
      name: 'private provider',
      type: 'openai-chat',
      modelName: 'model',
    };
    result.projection.coverage.projectedAssetCount = 1;
    result.semantic.queryModelVersion = 'local-model';
    result.semantic.coverage.indexedEntryCount = 1;
    recordReadingMemoryQuery(result);
    expect(recordUsage.mock.calls).toEqual([['query_completed'], ['fallback_partial_index']]);
  });

  it('does not count a completed query again for its AI result', () => {
    recordReadingMemoryJudgment({
      state: 'generated',
      output: { kind: 'reading-relations', relations: [] },
      evidence: [],
      inputTruncated: false,
      sentEvidenceCount: 0,
    });
    for (const reason of ['no_evidence', 'unconfigured', 'failed'] as const) {
      recordReadingMemoryJudgment({
        state: 'local',
        reason,
        evidence: [],
        inputTruncated: false,
        sentEvidenceCount: 0,
      });
    }
    expect(recordUsage.mock.calls).toEqual([['fallback_call_failure']]);
  });

  it('does not interrupt a user action if the optional telemetry call fails', async () => {
    recordUsage.mockRejectedValue(new Error('IPC unavailable'));
    expect(recordReadingMemoryUsage('source_jump')).toBeUndefined();
    await Promise.resolve();
    vi.stubGlobal('yomitomoDesktop', undefined);
    expect(recordReadingMemoryUsage('source_jump')).toBeUndefined();
  });
});

function session(): ReadingRelationsSession {
  return {
    requestId: 'request',
    mode: 'keyword',
    provider: null,
    remoteConsentRequired: true,
    evidence: [],
    projection: {
      state: 'available',
      coverage: { projectedAssetCount: 2, eligibleAssetCount: 2 },
    },
    semantic: {
      state: 'not_installed',
      modelVersion: 'local-model',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 2 },
      indexingPaused: false,
    },
  };
}
