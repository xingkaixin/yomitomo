import { useQuery } from '@tanstack/react-query';
import type { ReadingMemoryStatusSnapshot } from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';

const activeStatusPollMs = 1_000;
const idleStatusPollMs = 10_000;

export const readingMemoryStatusQueryKey = ['reading-memory', 'status'] as const;

export type ReadingMemoryActiveProgress =
  | {
      kind: 'downloading';
      downloadedBytes: number;
      totalBytes: number;
      percent: number;
    }
  | {
      kind: 'semantic';
      indexed: number;
      total: number;
      percent: number;
    }
  | {
      kind: 'projection';
      projected: number;
      total: number;
      percent: number;
    };

// Each status read runs coverage queries in main; poll quickly only while something is changing.
export function readingMemoryStatusPollDelay(snapshot: ReadingMemoryStatusSnapshot | undefined) {
  if (!snapshot) return idleStatusPollMs;
  const active =
    snapshot.model.status === 'checking' ||
    snapshot.model.status === 'downloading' ||
    snapshot.semantic.state === 'building' ||
    snapshot.semantic.state === 'rebuilding' ||
    snapshot.projection.state === 'building' ||
    snapshot.projection.state === 'stale';
  return active ? activeStatusPollMs : idleStatusPollMs;
}

export function readingMemoryActiveProgress(
  snapshot: ReadingMemoryStatusSnapshot | null | undefined,
): ReadingMemoryActiveProgress | null {
  if (!snapshot) return null;
  if (snapshot.model.status === 'downloading') {
    const totalBytes = Math.max(snapshot.model.downloadSizeBytes, 1);
    const downloadedBytes = Math.min(snapshot.model.downloadedBytes, totalBytes);
    return {
      kind: 'downloading',
      downloadedBytes,
      totalBytes,
      percent: Math.round((downloadedBytes / totalBytes) * 100),
    };
  }
  if (snapshot.projection.state === 'building') {
    const total = snapshot.projection.coverage.eligibleAssetCount;
    const projected = Math.min(snapshot.projection.coverage.projectedAssetCount, total);
    return {
      kind: 'projection',
      projected,
      total,
      percent: total > 0 ? Math.round((projected / total) * 100) : 0,
    };
  }
  if (
    !snapshot.semantic.indexingPaused &&
    (snapshot.semantic.state === 'building' || snapshot.semantic.state === 'rebuilding')
  ) {
    const total = snapshot.semantic.coverage.eligibleEntryCount;
    const indexed = Math.min(snapshot.semantic.coverage.indexedEntryCount, total);
    return {
      kind: 'semantic',
      indexed,
      total,
      percent: total > 0 ? Math.round((indexed / total) * 100) : 0,
    };
  }
  return null;
}

export function useReadingMemoryStatus(enabled = true) {
  const statusReader = getOptionalDesktopApi()?.readingMemory?.model?.status;
  return useQuery({
    queryKey: readingMemoryStatusQueryKey,
    queryFn: () => statusReader!(),
    enabled: enabled && Boolean(statusReader),
    refetchInterval: (query) => readingMemoryStatusPollDelay(query.state.data),
  });
}
