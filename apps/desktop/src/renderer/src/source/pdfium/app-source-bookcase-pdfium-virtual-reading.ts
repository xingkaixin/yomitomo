import { useRef, useState, type RefObject } from 'react';
import i18next from 'i18next';
import { isPdfTextAnchor, type Annotation, type PublicAgent } from '@yomitomo/shared';
import type { VirtualCursorState } from '@yomitomo/reader-ui/reader-types';
import { useAgentReadingDock } from '@yomitomo/reader-ui/use-agent-reading-dock';
import { pdfiumAnchorReadingPosition, type PageMetric } from './app-source-bookcase-pdfium-utils';

export function usePdfiumVirtualReading({
  annotationAgents,
  canvasRef,
  currentPage,
  onClearTheaterBoxes,
  pageMetricsRef,
}: {
  annotationAgents: PublicAgent[];
  canvasRef: RefObject<HTMLDivElement | null>;
  currentPage: number;
  onClearTheaterBoxes: () => void;
  pageMetricsRef: RefObject<Record<number, PageMetric>>;
}) {
  const virtualCursorRef = useRef(new Map<string, VirtualCursorState>());
  const virtualCursorTimersRef = useRef(new Map<string, number>());
  const virtualReadingTimersRef = useRef(new Map<string, number>());
  const virtualReadingStepRef = useRef(new Map<string, number>());
  const virtualReadingStepSizeRef = useRef(new Map<string, number>());
  const activeDockAgentIdsRef = useRef(new Set<string>());
  const dockHadFailureRef = useRef(false);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);
  const {
    agentDockCompleting,
    agentDockItems,
    completionBurstKey,
    activateAgentDock,
    markAgentDockDone,
    completeAgentDock,
    clearAgentDock,
  } = useAgentReadingDock(annotationAgents);

  function updatePdfiumVirtualCursor(cursorId: string, cursor: VirtualCursorState | null) {
    const timerId = virtualCursorTimersRef.current.get(cursorId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      virtualCursorTimersRef.current.delete(cursorId);
    }
    if (cursor) virtualCursorRef.current.set(cursorId, cursor);
    else virtualCursorRef.current.delete(cursorId);
    setVirtualCursors(Array.from(virtualCursorRef.current.values()));
  }

  function finishPdfiumVirtualCursor(cursorId: string) {
    const cursor = virtualCursorRef.current.get(cursorId);
    if (!cursor) return;
    updatePdfiumVirtualCursor(cursorId, { ...cursor, visible: false, leaving: true });
    const timerId = window.setTimeout(() => {
      updatePdfiumVirtualCursor(cursorId, null);
      virtualCursorTimersRef.current.delete(cursorId);
    }, 320);
    virtualCursorTimersRef.current.set(cursorId, timerId);
  }

  function clearAgentAnnotationPlayback() {
    for (const timerId of virtualCursorTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    for (const timerId of virtualReadingTimersRef.current.values()) {
      window.clearInterval(timerId);
    }
    virtualCursorTimersRef.current.clear();
    virtualReadingTimersRef.current.clear();
    virtualReadingStepRef.current.clear();
    virtualReadingStepSizeRef.current.clear();
    activeDockAgentIdsRef.current.clear();
    dockHadFailureRef.current = false;
    clearAgentDock();
    virtualCursorRef.current.clear();
    setVirtualCursors([]);
    onClearTheaterBoxes();
  }

  function startPdfiumAgentDock(agent: PublicAgent) {
    activeDockAgentIdsRef.current.add(agent.id);
    activateAgentDock(agent);
  }

  function finishPdfiumAgentDock(agentId: string, succeeded: boolean) {
    if (!activeDockAgentIdsRef.current.has(agentId)) return;
    markAgentDockDone(agentId);
    activeDockAgentIdsRef.current.delete(agentId);
    if (!succeeded) dockHadFailureRef.current = true;
    if (activeDockAgentIdsRef.current.size > 0) return;

    const shouldCelebrate = !dockHadFailureRef.current;
    dockHadFailureRef.current = false;
    completeAgentDock(shouldCelebrate);
  }

  function startPdfiumVirtualReading(agent: PublicAgent, anchor: Annotation['anchor'] | undefined) {
    stopPdfiumVirtualReading(agent.id);
    const readerIndex = virtualReadingTimersRef.current.size;
    const interval = 170 + Math.floor(Math.random() * 100);
    const stepSize = 3 + readerIndex * 2 + Math.floor(Math.random() * 5);
    virtualReadingStepRef.current.set(agent.id, readerIndex * 11);
    virtualReadingStepSizeRef.current.set(agent.id, stepSize);
    const tick = () => {
      const step = virtualReadingStepRef.current.get(agent.id) || 0;
      virtualReadingStepRef.current.set(
        agent.id,
        step + (virtualReadingStepSizeRef.current.get(agent.id) || 4),
      );
      const cursor = pdfiumReadingCursor(agent, anchor, step);
      if (cursor) updatePdfiumVirtualCursor(agent.id, cursor);
    };
    tick();
    virtualReadingTimersRef.current.set(agent.id, window.setInterval(tick, interval));
  }

  function stopPdfiumVirtualReading(agentId: string) {
    const timerId = virtualReadingTimersRef.current.get(agentId);
    if (timerId !== undefined) window.clearInterval(timerId);
    virtualReadingTimersRef.current.delete(agentId);
    virtualReadingStepRef.current.delete(agentId);
    virtualReadingStepSizeRef.current.delete(agentId);
  }

  function finishPdfiumVirtualReading(
    agentId: string,
    suffix = i18next.t('source.agentStatus.thoughtAdded'),
  ) {
    stopPdfiumVirtualReading(agentId);
    const current = virtualCursorRef.current.get(agentId);
    if (!current) return;
    updatePdfiumVirtualCursor(agentId, {
      ...current,
      x: Math.min(window.innerWidth - 80, current.x + 72),
      y: Math.max(72, current.y - 42),
      label: i18next.t('source.agentStatus.withSuffix', {
        name: current.agent?.nickname || i18next.t('common.assistant'),
        suffix,
      }),
      leaving: true,
    });
    const timerId = window.setTimeout(() => {
      updatePdfiumVirtualCursor(agentId, null);
      virtualCursorTimersRef.current.delete(agentId);
    }, 900);
    virtualCursorTimersRef.current.set(agentId, timerId);
  }

  function pdfiumReadingCursor(
    agent: PublicAgent,
    anchor: Annotation['anchor'] | undefined,
    step: number,
  ): VirtualCursorState | null {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (canvasRect && anchor && isPdfTextAnchor(anchor)) {
      const position = pdfiumAnchorReadingPosition(anchor, pageMetricsRef.current, step);
      if (position) {
        return {
          id: agent.id,
          visible: true,
          x: canvasRect.left + position.x,
          y: canvasRect.top + position.y,
          label: i18next.t('source.agentStatus.reading', { name: agent.nickname }),
          offscreen: null,
          agent,
        };
      }
    }

    return pdfiumReadingFallbackCursor(
      agent.id,
      agent,
      anchor && isPdfTextAnchor(anchor) ? anchor.pageIndex : undefined,
      i18next.t('source.agentStatus.reading', { name: agent.nickname }),
      step,
    );
  }

  function pdfiumReadingFallbackCursor(
    cursorId: string,
    agent: PublicAgent | undefined,
    pageIndex: number | undefined,
    visibleLabel: string,
    step: number,
  ): VirtualCursorState | null {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const viewportRect = pdfiumViewportRect();
    if (!canvasRect || !viewportRect) return null;

    const offscreen =
      pageIndex === undefined ? null : pdfiumOffscreenDirection(pageIndex, pageMetricsRef.current);
    if (offscreen) {
      return {
        id: cursorId,
        visible: true,
        x: viewportRect.left + viewportRect.width / 2,
        y: offscreen === 'above' ? viewportRect.top + 20 : viewportRect.bottom - 20,
        label: i18next.t('source.agentStatus.readingOffscreen', {
          direction: i18next.t(`source.agentStatus.direction.${offscreen}`),
          name: agent?.nickname || i18next.t('common.assistant'),
        }),
        offscreen,
        agent,
      };
    }

    const metric =
      pageIndex !== undefined ? pageMetricsRef.current[pageIndex] : firstVisiblePdfiumPageMetric();
    const targetMetric = metric || firstVisiblePdfiumPageMetric();
    if (!targetMetric) {
      return {
        id: cursorId,
        visible: true,
        x: viewportRect.left + viewportRect.width / 2,
        y: viewportRect.top + 48,
        label: visibleLabel,
        offscreen: null,
        agent,
      };
    }

    const visibleTop = Math.max(targetMetric.top, targetMetric.clipTop);
    const visibleBottom = Math.min(targetMetric.top + targetMetric.height, targetMetric.clipBottom);
    const travelWidth = Math.max(1, targetMetric.width - 128);
    return {
      id: cursorId,
      visible: true,
      x: canvasRect.left + targetMetric.left + 64 + ((step * 12) % travelWidth),
      y:
        canvasRect.top +
        Math.min(visibleBottom - 24, Math.max(visibleTop + 24, targetMetric.top + 56)),
      label: visibleLabel,
      offscreen: null,
      agent,
    };
  }

  function pdfiumViewportRect() {
    return (
      canvasRef.current
        ?.querySelector<HTMLElement>('.pdfium-spike-viewport')
        ?.getBoundingClientRect() ||
      canvasRef.current?.getBoundingClientRect() ||
      null
    );
  }

  function firstVisiblePdfiumPageMetric() {
    return Object.values(pageMetricsRef.current).toSorted((left, right) => left.top - right.top)[0];
  }

  function pdfiumOffscreenDirection(
    pageIndex: number,
    metrics: Record<number, PageMetric>,
  ): 'above' | 'below' | null {
    if (metrics[pageIndex]) return null;
    const visiblePageIndexes = Object.keys(metrics)
      .map(Number)
      .filter(Number.isFinite)
      .toSorted((left, right) => left - right);
    const firstPageIndex = visiblePageIndexes[0];
    const lastPageIndex = visiblePageIndexes[visiblePageIndexes.length - 1];
    if (firstPageIndex === undefined || lastPageIndex === undefined) {
      return pageIndex + 1 < currentPage ? 'above' : 'below';
    }
    if (pageIndex < firstPageIndex) return 'above';
    if (pageIndex > lastPageIndex) return 'below';
    return pageIndex + 1 < currentPage ? 'above' : 'below';
  }

  return {
    agentDockCompleting,
    agentDockItems,
    clearAgentAnnotationPlayback,
    completionBurstKey,
    finishPdfiumAgentDock,
    finishPdfiumVirtualCursor,
    finishPdfiumVirtualReading,
    pdfiumOffscreenDirection,
    pdfiumReadingFallbackCursor,
    startPdfiumAgentDock,
    startPdfiumVirtualReading,
    stopPdfiumVirtualReading,
    updatePdfiumVirtualCursor,
    virtualCursors,
  };
}
