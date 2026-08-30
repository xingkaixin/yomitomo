import { validateReadingJudgment } from '@yomitomo/core';
import type {
  LlmProvider,
  ReadingEvidence,
  ReadingJudgmentInput,
  ReadingJudgmentResult,
} from '@yomitomo/shared';
import { logAiInfo } from '../logger';
import { generateYomitomoText } from '../provider/generation-runtime';
import { prepareReadingJudgmentInput } from './reading-judgment-input';
import { readingJudgmentSystemPrompt } from './reading-judgment-prompt';

const judgmentTimeoutMs = 45_000;
const maximumResponseChars = 65_536;

type ReadingJudgmentOptions = {
  signal?: AbortSignal;
  /** Reread the supplied snapshots against current source versions, scope, and database generation. */
  revalidateEvidence: (evidence: readonly ReadingEvidence[]) => Promise<ReadingEvidence[]>;
};

export async function runReadingJudgment(
  provider: LlmProvider | undefined,
  input: ReadingJudgmentInput,
  evidence: readonly ReadingEvidence[],
  options: ReadingJudgmentOptions,
): Promise<ReadingJudgmentResult> {
  const startedAt = performance.now();
  let sentEvidenceCount = 0;
  let inputTruncated = false;
  let deadline: AbortSignal | undefined;
  throwIfCanceled(options.signal);

  function local(
    reason: Extract<ReadingJudgmentResult, { state: 'local' }>['reason'],
    current: ReadingEvidence[],
  ): ReadingJudgmentResult {
    logAiInfo('reading-memory.judgment.finish', {
      kind: input.kind,
      state: 'local',
      reason,
      sentEvidenceCount,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return { state: 'local', reason, evidence: current, inputTruncated, sentEvidenceCount };
  }

  try {
    const current = await options.revalidateEvidence(evidence);
    throwIfCanceled(options.signal);
    if (!provider) return local('unconfigured', current);
    if (current.length === 0) return local('no_evidence', current);
    const prepared = prepareReadingJudgmentInput(provider, input, current);
    if (!prepared) return local('input_too_large', current);
    inputTruncated = prepared.truncated;
    sentEvidenceCount = prepared.sent.size;
    deadline = AbortSignal.timeout(judgmentTimeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    const response = await generateYomitomoText(
      provider,
      {
        system: readingJudgmentSystemPrompt(input.kind),
        user: prepared.user,
        maxTokens: 2048,
      },
      { signal, failOnMaxTokens: true, disableTelemetry: true },
    );
    signal.throwIfAborted();
    const fresh = await options.revalidateEvidence([...prepared.sent.values()]);
    signal.throwIfAborted();
    const output = validateReadingJudgment(
      input.kind,
      parseResponse(response.text),
      prepared.sent,
      fresh,
    );
    if (!output) return local('failed', fresh);
    logAiInfo('reading-memory.judgment.finish', {
      kind: input.kind,
      state: 'generated',
      sentEvidenceCount,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return {
      state: 'generated',
      output,
      evidence: fresh,
      inputTruncated,
      sentEvidenceCount,
    };
  } catch {
    throwIfCanceled(options.signal);
    logAiInfo('reading-memory.judgment.failure', {
      kind: input.kind,
      category: deadline?.aborted ? 'timeout' : 'request_or_validation',
    });
    const fresh = await options.revalidateEvidence(evidence).catch(() => []);
    throwIfCanceled(options.signal);
    return local('failed', fresh);
  }
}

function parseResponse(text: string): unknown {
  if (text.length > maximumResponseChars) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function throwIfCanceled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Reading judgment canceled', 'AbortError');
}
