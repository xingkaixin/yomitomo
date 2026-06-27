import React from 'react';
import type { TocItem } from '@yomitomo/core';
import { Highlighter, Layers2 } from 'lucide-react';
import type { buildTocAnnotationStats } from '../annotations/reader-annotations';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

function readTocNumber(root: HTMLElement, name: string, fallback: number) {
  const value = parseFloat(getComputedStyle(root).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function readTocEase(root: HTMLElement, name: string, fallback: string) {
  return getComputedStyle(root).getPropertyValue(name).trim() || fallback;
}

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
  const tocRef = React.useRef<HTMLElement | null>(null);
  const activeItemRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!tocOpen || activeTocIndex === null || activeTocIndex === undefined) return;
    activeItemRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeTocIndex, tocOpen]);

  function setTocProximity(activeIndex: number | null, phase: 'in' | 'out') {
    if (!tocRef.current) return;

    const root = tocRef.current;
    const shift = readTocNumber(root, '--reader-toc-shift-max', 3);
    const falloff = readTocNumber(root, '--reader-toc-falloff', 0.48);
    const activeScale = readTocNumber(root, '--reader-toc-line-active-scale', 1.72);
    const timing =
      phase === 'out'
        ? readTocEase(root, '--reader-toc-ease-out', 'cubic-bezier(0.34,3.85,0.64,1)')
        : readTocEase(root, '--reader-toc-ease-in', 'cubic-bezier(0.22,1,0.36,1)');

    root.querySelectorAll<HTMLElement>('.reader-toc-item').forEach((element, index) => {
      element.style.setProperty('--reader-toc-ease', timing);
      if (activeIndex === null) {
        element.style.removeProperty('--reader-toc-shift');
        element.style.removeProperty('--reader-toc-line-scale');
        return;
      }

      const distance = Math.abs(index - activeIndex);
      const strength = Math.pow(falloff, distance);
      element.style.setProperty('--reader-toc-shift', `${(shift * strength).toFixed(3)}px`);
      element.style.setProperty(
        '--reader-toc-line-scale',
        (1 + (activeScale - 1) * strength).toFixed(3),
      );
    });
  }

  function updateTocProximity(event: React.PointerEvent<HTMLElement>) {
    if (!tocRef.current) return;

    const items = Array.from(tocRef.current.querySelectorAll<HTMLElement>('.reader-toc-item'));
    if (items.length === 0) return;

    const pointerY = event.clientY;
    const nearestIndex = items.reduce(
      (nearest, item, index) => {
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(pointerY - (rect.top + rect.height / 2));
        return distance < nearest.distance ? { index, distance } : nearest;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index;

    setTocProximity(nearestIndex, 'in');
  }

  return (
    <aside
      ref={tocRef}
      className={hasToc ? 'reader-toc' : 'reader-toc is-empty'}
      aria-hidden={!hasToc || !tocOpen}
      aria-label={labels.toc}
      onPointerMove={updateTocProximity}
      onPointerLeave={() => setTocProximity(null, 'out')}
    >
      <div className="reader-toc-title">{labels.toc}</div>
      {tocItems.map((item, tocPosition) => {
        const active = item.index === activeTocIndex;
        const stats = tocAnnotationStats.get(item.index);
        const colors = stats?.colors ?? [];
        const annotationCount = stats?.count ?? 0;
        const annotationColor = colors[0];
        const badgeStyle =
          annotationCount > 0 && annotationColor
            ? ({ '--reader-toc-count-color': annotationColor } as React.CSSProperties)
            : undefined;
        const buttonLabel =
          annotationCount > 0
            ? `${item.text}，${annotationCount} ${labels.annotations}`
            : item.text;
        return (
          <button
            className={active ? 'reader-toc-item is-active' : 'reader-toc-item'}
            data-depth={Math.min(item.depth, 4)}
            key={`${item.index}-${item.text}`}
            ref={active ? activeItemRef : undefined}
            type="button"
            aria-label={buttonLabel}
            aria-current={active ? 'location' : undefined}
            onPointerEnter={() => setTocProximity(tocPosition, 'in')}
            onFocus={() => setTocProximity(tocPosition, 'in')}
            onBlur={() => setTocProximity(null, 'out')}
            onClick={() => onScrollToHeading(item)}
          >
            <span className="reader-toc-line" aria-hidden="true" />
            <span className="reader-toc-item-main">
              <span className="reader-toc-label">{item.text}</span>
              {annotationCount > 0 ? (
                <span
                  className="reader-toc-count"
                  style={badgeStyle}
                  title={`${annotationCount} ${labels.annotations}`}
                  aria-hidden="true"
                >
                  {annotationCount}
                </span>
              ) : null}
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
