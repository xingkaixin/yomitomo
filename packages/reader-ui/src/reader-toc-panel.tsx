import type { TocItem } from '@yomitomo/core';
import { Highlighter, Lightbulb } from 'lucide-react';
import type { buildTocAnnotationStats } from './reader-utils';
import { isPrimaryTocItem } from './reader-utils';

export type ReaderTocPanelProps = {
  annotationTotals: { annotations: number; comments: number };
  hasToc: boolean;
  tocAnnotationStats: ReturnType<typeof buildTocAnnotationStats>;
  tocItems: TocItem[];
  tocOpen: boolean;
  onScrollToHeading: (item: TocItem) => void;
};

export function ReaderTocPanel({
  annotationTotals,
  hasToc,
  tocAnnotationStats,
  tocItems,
  tocOpen,
  onScrollToHeading,
}: ReaderTocPanelProps) {
  return (
    <aside
      className={hasToc ? 'reader-toc' : 'reader-toc is-empty'}
      aria-hidden={!hasToc || !tocOpen}
      aria-label="目录"
    >
      <div className="reader-toc-title">目录</div>
      {tocItems.map((item) => {
        const stats = isPrimaryTocItem(item) ? tocAnnotationStats.get(item.index) : undefined;
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
                {(stats?.count || 0) > 0 ? <strong>{stats?.count}</strong> : null}
              </span>
            </span>
          </button>
        );
      })}
      <div
        className="reader-toc-summary"
        aria-label={`${annotationTotals.annotations} 划线，${annotationTotals.comments} 想法`}
      >
        <span className="reader-toc-summary-stat" title="划线">
          <span className="reader-toc-summary-value">{annotationTotals.annotations}</span>
          <Highlighter size={14} aria-hidden="true" />
        </span>
        <span className="reader-toc-summary-separator" aria-hidden="true">
          ·
        </span>
        <span className="reader-toc-summary-stat" title="想法">
          <span className="reader-toc-summary-value">{annotationTotals.comments}</span>
          <Lightbulb size={14} aria-hidden="true" />
        </span>
      </div>
    </aside>
  );
}
