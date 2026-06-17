import React from 'react';
import type { TocItem } from '@yomitomo/core';
import { Highlighter, Layers2 } from 'lucide-react';
import type { buildTocAnnotationStats } from '../annotations/reader-annotations';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

export type ReaderTocPanelProps = {
  activeTocIndex?: number | null;
  annotationTotals: { annotations: number; distillations: number };
  hasToc: boolean;
  labels?: ReaderUiLabels;
  tocAnnotationStats: ReturnType<typeof buildTocAnnotationStats>;
  tocItems: TocItem[];
  tocOpen: boolean;
  onScrollToHeading: (item: TocItem) => void;
};

export function ReaderTocPanel({
  activeTocIndex,
  annotationTotals,
  hasToc,
  labels = defaultReaderUiLabels,
  tocAnnotationStats,
  tocItems,
  tocOpen,
  onScrollToHeading,
}: ReaderTocPanelProps) {
  const activeItemRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!tocOpen || activeTocIndex === null || activeTocIndex === undefined) return;
    activeItemRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeTocIndex, tocOpen]);

  return (
    <aside
      className={hasToc ? 'reader-toc' : 'reader-toc is-empty'}
      aria-hidden={!hasToc || !tocOpen}
      aria-label={labels.toc}
    >
      <div className="reader-toc-title">{labels.toc}</div>
      {tocItems.map((item) => {
        const active = item.index === activeTocIndex;
        const stats = tocAnnotationStats.get(item.index);
        const colors = stats?.colors ?? [];
        const distillationCount = stats?.distillationCount ?? 0;
        return (
          <button
            className={active ? 'reader-toc-item is-active' : 'reader-toc-item'}
            data-depth={Math.min(item.depth, 4)}
            key={`${item.index}-${item.text}`}
            ref={active ? activeItemRef : undefined}
            type="button"
            aria-current={active ? 'location' : undefined}
            onClick={() => onScrollToHeading(item)}
          >
            <span className="reader-toc-item-main">
              <span>{item.text}</span>
              <span className="reader-toc-meta">
                {colors.length > 0 ? (
                  <span className="reader-toc-markers">
                    {colors.slice(0, 5).map((color) => (
                      <i key={color} style={{ backgroundColor: color }} />
                    ))}
                  </span>
                ) : null}
                {distillationCount > 0 ? <strong>{distillationCount}</strong> : null}
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
