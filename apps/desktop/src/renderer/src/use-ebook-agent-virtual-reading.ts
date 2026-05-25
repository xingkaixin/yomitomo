import { useCallback, useRef, useState, type RefObject } from 'react';
import type { Annotation, PublicAgent } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import type { VirtualCursorState } from '@yomitomo/reader-ui/reader-types';
import { useAgentReadingDock } from '@yomitomo/reader-ui/use-agent-reading-dock';
import {
  currentFoliateContent,
  lastFoliateRangeViewportRect,
  rangeForEbookAnchorCursorInDocument,
  type FoliateViewElement,
} from './app-ebook-reader-utils';

type UseEbookAgentVirtualReadingInput = {
  agents: PublicAgent[];
  canvasRef: RefObject<HTMLDivElement | null>;
  viewHostRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateViewElement | null>;
};

export function useEbookAgentVirtualReading({
  agents,
  canvasRef,
  viewHostRef,
  viewRef,
}: UseEbookAgentVirtualReadingInput) {
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);
  const virtualCursorRef = useRef(new Map<string, VirtualCursorState>());
  const virtualReadingTimersRef = useRef(new Map<string, number>());
  const agentAnimationQueueRef = useRef(Promise.resolve());
  const virtualReadingStepRef = useRef(new Map<string, number>());
  const virtualReadingStepSizeRef = useRef(new Map<string, number>());
  const activeDockAgentIdsRef = useRef(new Set<string>());
  const dockHadFailureRef = useRef(false);
  const {
    agentDockCompleting,
    agentDockItems,
    completionBurstKey,
    activateAgentDock,
    markAgentDockDone,
    completeAgentDock,
    clearAgentDock,
  } = useAgentReadingDock(agents);

  const cursorAgent = useCallback(
    (annotation: Annotation) => {
      return agents.find(
        (agent) => agent.id === annotation.agentId || agent.username === annotation.agentUsername,
      );
    },
    [agents],
  );

  const updateVirtualCursor = useCallback((cursorId: string, cursor: VirtualCursorState | null) => {
    if (cursor) virtualCursorRef.current.set(cursorId, cursor);
    else virtualCursorRef.current.delete(cursorId);
    setVirtualCursors(Array.from(virtualCursorRef.current.values()));
  }, []);

  const stopVirtualReadingTimer = useCallback((agentId: string) => {
    const timerId = virtualReadingTimersRef.current.get(agentId);
    if (timerId !== undefined) window.clearInterval(timerId);
    virtualReadingTimersRef.current.delete(agentId);
    virtualReadingStepRef.current.delete(agentId);
    virtualReadingStepSizeRef.current.delete(agentId);
  }, []);

  const startAgentDock = useCallback(
    (agent: PublicAgent) => {
      activeDockAgentIdsRef.current.add(agent.id);
      activateAgentDock(agent);
    },
    [activateAgentDock],
  );

  const finishAgentDock = useCallback(
    (agentId: string, succeeded: boolean) => {
      if (!activeDockAgentIdsRef.current.has(agentId)) return;
      markAgentDockDone(agentId);
      activeDockAgentIdsRef.current.delete(agentId);
      if (!succeeded) dockHadFailureRef.current = true;
      if (activeDockAgentIdsRef.current.size > 0) return;

      const shouldCelebrate = !dockHadFailureRef.current;
      dockHadFailureRef.current = false;
      completeAgentDock(shouldCelebrate);
    },
    [completeAgentDock, markAgentDockDone],
  );

  const cleanupAgentTheater = useCallback(() => {
    for (const timerId of virtualReadingTimersRef.current.values()) {
      window.clearInterval(timerId);
    }
    virtualReadingTimersRef.current.clear();
    virtualReadingStepRef.current.clear();
    virtualReadingStepSizeRef.current.clear();
    virtualCursorRef.current.clear();
    activeDockAgentIdsRef.current.clear();
    dockHadFailureRef.current = false;
    clearAgentDock();
    setVirtualCursors([]);
    setAgentTheaterBoxes([]);
  }, [clearAgentDock]);

  const readingCursorForAnchor = useCallback(
    (
      agent: PublicAgent,
      anchor: Annotation['anchor'] | undefined,
      step: number,
    ): VirtualCursorState | null => {
      const canvasElement = canvasRef.current;
      const doc = currentFoliateContent(viewRef.current)?.doc;
      if (canvasElement && doc && anchor) {
        const canvasRect = canvasElement.getBoundingClientRect();
        const range = rangeForEbookAnchorCursorInDocument(doc, anchor, step);
        const rect = range ? lastFoliateRangeViewportRect(range, canvasRect) : null;
        if (rect) {
          return {
            id: agent.id,
            visible: true,
            x: rect.left + rect.width,
            y: rect.top + rect.height / 2,
            label: `${agent.nickname} 正在阅读`,
            offscreen: null,
            agent,
          };
        }
      }

      const fallbackRect =
        viewHostRef.current?.getBoundingClientRect() || canvasRef.current?.getBoundingClientRect();
      if (!fallbackRect) return null;
      return {
        id: agent.id,
        visible: true,
        x: fallbackRect.left + Math.min(fallbackRect.width - 40, 72 + step * 12),
        y: fallbackRect.top + 56,
        label: `${agent.nickname} 正在阅读`,
        offscreen: null,
        agent,
      };
    },
    [canvasRef, viewHostRef, viewRef],
  );

  const startVirtualReading = useCallback(
    (agent: PublicAgent, anchor: Annotation['anchor'] | undefined) => {
      stopVirtualReadingTimer(agent.id);
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
        const cursor = readingCursorForAnchor(agent, anchor, step);
        if (cursor) updateVirtualCursor(agent.id, cursor);
      };
      tick();
      virtualReadingTimersRef.current.set(agent.id, window.setInterval(tick, interval));
    },
    [readingCursorForAnchor, stopVirtualReadingTimer, updateVirtualCursor],
  );

  const finishVirtualReading = useCallback(
    (agentId: string, suffix = '想法已添加') => {
      stopVirtualReadingTimer(agentId);
      const current = virtualCursorRef.current.get(agentId);
      if (!current) return;
      updateVirtualCursor(agentId, {
        ...current,
        x: Math.min(window.innerWidth - 80, current.x + 72),
        y: Math.max(72, current.y - 42),
        label: `${current.agent?.nickname || '助手'} ${suffix}`,
        leaving: true,
      });
      window.setTimeout(() => updateVirtualCursor(agentId, null), 900);
    },
    [stopVirtualReadingTimer, updateVirtualCursor],
  );

  return {
    agentDockCompleting,
    agentDockItems,
    agentTheaterBoxes,
    completionBurstKey,
    virtualCursors,
    agentAnimationQueueRef,
    cleanupAgentTheater,
    cursorAgent,
    finishAgentDock,
    finishVirtualReading,
    setAgentTheaterBoxes,
    startAgentDock,
    startVirtualReading,
    stopVirtualReadingTimer,
    updateVirtualCursor,
  };
}
