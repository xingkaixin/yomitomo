import type { ArticleReadingProgress } from '@yomitomo/shared';

export function readingProgressRatio(progress: ArticleReadingProgress | undefined) {
  if (!progress) return 0;

  switch (progress.kind) {
    case 'scroll':
      return clampRatio(progress.progress);
    case 'page':
      return progress.pageCount <= 1
        ? 1
        : clampRatio(progress.pageIndex / (progress.pageCount - 1));
    case 'chapter':
      return clampRatio(progress.bookProgress);
  }
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
