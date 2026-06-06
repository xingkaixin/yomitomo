import type { TocItem } from '@yomitomo/core';
import { Highlighter, Layers2 } from 'lucide-react';
import type { buildTocAnnotationStats } from '../annotations/reader-annotations';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

export type ReaderTocPanelProps = {
  annotationTotals: { annotations: number; distillations: number };
  hasToc: boolean;
  labels?: ReaderUiLabels;
  tocAnnotationStats: ReturnType<typeof buildTocAnnotationStats>;
  tocItems: TocItem[];
  tocOpen: boolean;
  onScrollToHeading: (item: TocItem) => void;
};

export function ReaderTocPanel({
  annotationTotals,
  hasToc,
  labels = defaultReaderUiLabels,
  tocAnnotationStats,
  tocItems,
  tocOpen,
  onScrollToHeading,
}: ReaderTocPanelProps) {
  return (
    <aside
      className={hasToc ? 'reader-toc' : 'reader-toc is-empty'}
      aria-hidden={!hasToc || !tocOpen}
      aria-label={labels.toc}
    >
      <div className="reader-toc-title">{labels.toc}</div>
      {tocItems.map((item) => {
        const stats = tocAnnotationStats.get(item.index);
        return (
          <button
            className="reader-toc-item"
            data-depth={Math.min(item.depth, 4)}
            key={`${item.index}-${item.text}`}
            type="button"
            onClick={() => onScrollToHeading(item)}
          >
            <span className="reader-toc-item-main">
              <span>{item.text}</span>
              <span className="reader-toc-meta">
                {(stats?.colors.length || 0) > 0 ? (
                  <span className="reader-toc-markers">
                    {stats!.colors.slice(0, 5).map((color) => (
                      <i key={color} style={{ backgroundColor: color }} />
                    ))}
                  </span>
                ) : null}
                {(stats?.distillationCount || 0) > 0 ? (
                  <strong>{stats?.distillationCount}</strong>
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
      <div
        className="reader-toc-summary"
        aria-label={labels.tocSummary(annotationTotals.annotations, annotationTotals.distillations)}
      >
        <span className="reader-toc-summary-stat" title={labels.annotations}>
          <span className="reader-toc-summary-value">{annotationTotals.annotations}</span>
          <Highlighter size={14} aria-hidden="true" />
        </span>
        <span className="reader-toc-summary-separator" aria-hidden="true">
          ·
        </span>
        <span className="reader-toc-summary-stat" title={labels.distillations}>
          <span className="reader-toc-summary-value">{annotationTotals.distillations}</span>
          <Layers2 size={14} aria-hidden="true" />
        </span>
      </div>
    </aside>
  );
}
