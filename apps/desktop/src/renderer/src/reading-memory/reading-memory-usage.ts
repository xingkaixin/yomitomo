import type { ReadingJudgmentResult } from '@yomitomo/shared';
import type { DesktopIpcInvokeArgs, ReadingRelationsSession } from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';

export function recordReadingMemoryUsage(
  key: DesktopIpcInvokeArgs<'reading-memory:record-usage'>[0],
) {
  void getOptionalDesktopApi()
    ?.readingMemory?.recordUsage?.(key)
    .catch(() => undefined);
}

export function recordReadingMemoryQuery(
  result: Pick<ReadingRelationsSession, 'mode' | 'projection' | 'semantic' | 'provider'>,
) {
  recordReadingMemoryUsage('query_completed');
  if (result.mode === 'keyword') recordReadingMemoryUsage('fallback_keyword');
  const { projection, semantic } = result;
  if (
    projection.coverage.projectedAssetCount < projection.coverage.eligibleAssetCount ||
    (semantic.queryModelVersion !== null &&
      semantic.coverage.indexedEntryCount < semantic.coverage.eligibleEntryCount)
  ) {
    recordReadingMemoryUsage('fallback_partial_index');
  }
  if (!result.provider) recordReadingMemoryUsage('fallback_no_provider');
}

export function recordReadingMemoryJudgment(result: ReadingJudgmentResult) {
  if (result.state === 'local' && result.reason === 'failed') {
    recordReadingMemoryUsage('fallback_call_failure');
  }
}
