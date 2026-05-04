import React, { useEffect, useRef, useState } from 'react';
import type { Annotation, PublicAgent } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import { annotationToPublicAgent as annotationToAgent } from '@yomitomo/core';
import {
  cursorPositionFromOffset,
  offsetFromArticleStart,
  rangeFromOffsets,
  rangeHighlightBoxes,
  type HighlightBox,
} from './reader-dom';
import type { VirtualCursorState } from './reader-components';
import { agentQueueKey, animateTheaterHighlight, sleep } from './reader-utils';

type VirtualReadingSession = {
  agent: PublicAgent;
  timerId: number;
  offset: number;
  paused: boolean;
  done: boolean;
  step: number;
};

type UseAgentAnnotationQueueOptions = {
  agents: PublicAgent[];
  articleRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  annotationsRef: React.MutableRefObject<Annotation[]>;
  saveAnnotations: (annotations: Annotation[]) => void | Promise<void>;
  setActiveId: (annotationId: string) => void;
  readerLog: (event: string, data?: Record<string, unknown>) => void;
};

export function useAgentAnnotationQueue({
  agents,
  articleRef,
  canvasRef,
  surfaceRef,
  annotationsRef,
  saveAnnotations,
  setActiveId,
  readerLog,
}: UseAgentAnnotationQueueOptions) {
  const agentAnnotationQueuesRef = useRef(new Map<string, Annotation[]>());
  const agentQueueOrderRef = useRef<string[]>([]);
  const lastPlayedAgentRef = useRef<string | null>(null);
  const agentAnimationRunningRef = useRef(false);
  const virtualReadingSessionsRef = useRef(new Map<string, VirtualReadingSession>());
  const virtualCursorRef = useRef(new Map<string, VirtualCursorState>());
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [annotatingAgents, setAnnotatingAgents] = useState<string[]>([]);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);

  useEffect(() => {
    setAnnotatingAgents((ids) => ids.filter((id) => agents.some((agent) => agent.id === id)));
  }, [agents]);

  function enqueueAgentAnnotation(annotation: Annotation) {
    const key = agentQueueKey(annotation);
    const queue = agentAnnotationQueuesRef.current.get(key) || [];
    queue.push(annotation);
    agentAnnotationQueuesRef.current.set(key, queue);
    if (!agentQueueOrderRef.current.includes(key)) agentQueueOrderRef.current.push(key);
    readerLog('agent.queue.enqueue', {
      annotationId: annotation.id,
      agent: key,
      size: queuedAnnotationsCount(),
    });
  }

  function queuedAnnotationsCount() {
    let count = 0;
    for (const queue of agentAnnotationQueuesRef.current.values()) count += queue.length;
    return count;
  }

  function hasQueuedAnnotationForAgent(agentId: string) {
    return (agentAnnotationQueuesRef.current.get(agentId)?.length || 0) > 0;
  }

  function hasQueuedAnnotationForOtherAgent(agentId: string) {
    for (const [key, queue] of agentAnnotationQueuesRef.current) {
      if (key !== agentId && queue.length > 0) return true;
    }
    return false;
  }

  function nextQueuedAgentKey() {
    const order = agentQueueOrderRef.current;
    if (order.length === 0) return null;

    const lastIndex = lastPlayedAgentRef.current ? order.indexOf(lastPlayedAgentRef.current) : -1;
    for (let index = 1; index <= order.length; index += 1) {
      const key = order[(lastIndex + index + order.length) % order.length];
      if ((agentAnnotationQueuesRef.current.get(key)?.length || 0) > 0) return key;
    }
    return null;
  }

  function cleanupAgentQueue(agentId: string | null) {
    if (!agentId) return;
    const queue = agentAnnotationQueuesRef.current.get(agentId);
    if (queue && queue.length > 0) return;
    if (virtualReadingSessionsRef.current.has(agentId)) return;
    agentAnnotationQueuesRef.current.delete(agentId);
    agentQueueOrderRef.current = agentQueueOrderRef.current.filter((key) => key !== agentId);
    if (lastPlayedAgentRef.current === agentId) lastPlayedAgentRef.current = null;
  }

  function shouldWaitForPeerAgent(agentId: string) {
    if (hasQueuedAnnotationForOtherAgent(agentId)) return false;
    for (const [key, session] of virtualReadingSessionsRef.current) {
      if (key !== agentId && !session.done) return true;
    }
    return false;
  }

  function markAgentAnnotating(agentId: string, annotating: boolean) {
    setAnnotatingAgents((ids) => {
      if (annotating) return ids.includes(agentId) ? ids : [...ids, agentId];
      return ids.filter((id) => id !== agentId);
    });
  }

  function startVirtualReading(agent: PublicAgent) {
    const currentSession = virtualReadingSessionsRef.current.get(agent.id);
    if (currentSession) window.clearInterval(currentSession.timerId);

    const article = articleRef.current;
    const body = article?.querySelector('.reader-article-body');
    const sessionIndex = virtualReadingSessionsRef.current.size;
    const interval = 150 + Math.floor(Math.random() * 90);
    const step = 5 + sessionIndex * 2 + Math.floor(Math.random() * 8);
    const session: VirtualReadingSession = {
      agent,
      timerId: 0,
      offset: (article && body ? offsetFromArticleStart(article, body, 0) : 0) + sessionIndex * 18,
      paused: false,
      done: false,
      step,
    };
    virtualReadingSessionsRef.current.set(agent.id, session);
    tickVirtualReading(agent.id);
    session.timerId = window.setInterval(() => tickVirtualReading(agent.id), interval);
    readerLog('virtual.reading.start', { agent: agent.username });
  }

  function tickVirtualReading(agentId: string) {
    const session = virtualReadingSessionsRef.current.get(agentId);
    if (!session || session.paused) return;

    const article = articleRef.current;
    const surface = surfaceRef.current;
    if (!article || !surface) return;

    const text = article.textContent || '';
    if (session.offset >= text.length - 1) {
      finishVirtualReading(agentId, '读完了');
      return;
    }

    const position = cursorPositionFromOffset(article, surface, session.offset + session.step);
    if (!position) return;

    session.offset = position.offset;
    updateVirtualCursor(agentId, {
      id: agentId,
      visible: true,
      x: position.x,
      y: position.y,
      label: position.offscreen
        ? `${session.agent.nickname} 正在${position.offscreen === 'above' ? '上方' : '下方'}阅读`
        : `${session.agent.nickname} 正在阅读`,
      offscreen: position.offscreen,
      agent: session.agent,
    });
  }

  function updateVirtualCursor(agentId: string, cursor: VirtualCursorState | null) {
    if (cursor) virtualCursorRef.current.set(agentId, cursor);
    else virtualCursorRef.current.delete(agentId);
    setVirtualCursors(Array.from(virtualCursorRef.current.values()));
  }

  function finishVirtualReading(agentId: string, suffix = '批注完成') {
    const session = virtualReadingSessionsRef.current.get(agentId);
    if (session) {
      window.clearInterval(session.timerId);
      virtualReadingSessionsRef.current.delete(agentId);
    }

    const current =
      virtualCursorRef.current.get(agentId) ||
      (session
        ? {
            id: agentId,
            visible: true,
            x: Math.min(window.innerWidth - 120, Math.max(120, window.innerWidth / 2)),
            y: 96,
            label: '',
            offscreen: null,
            agent: session.agent,
          }
        : null);
    if (!current) return;

    updateVirtualCursor(agentId, {
      ...current,
      x: Math.min(window.innerWidth - 80, current.x + 72),
      y: Math.max(72, current.y - 42),
      label: `${session?.agent.nickname || current.agent?.nickname || '助手'} ${suffix}`,
      leaving: true,
    });
    window.setTimeout(() => updateVirtualCursor(agentId, null), 900);
  }

  function finishVirtualReadingIfIdle(agentId?: string) {
    const agentIds = agentId ? [agentId] : Array.from(virtualReadingSessionsRef.current.keys());
    if (agentAnimationRunningRef.current) return;
    window.setTimeout(() => {
      if (agentAnimationRunningRef.current) return;
      for (const id of agentIds) {
        const session = virtualReadingSessionsRef.current.get(id);
        if (session?.done && !hasQueuedAnnotationForAgent(id)) {
          finishVirtualReading(id);
        }
      }
    }, 900);
  }

  async function processAgentAnnotationQueue() {
    if (agentAnimationRunningRef.current) return;

    agentAnimationRunningRef.current = true;
    try {
      while (queuedAnnotationsCount() > 0) {
        const queueKey = nextQueuedAgentKey();
        if (!queueKey) break;
        const annotation = queueKey
          ? agentAnnotationQueuesRef.current.get(queueKey)?.shift()
          : undefined;
        if (!annotation) continue;

        try {
          lastPlayedAgentRef.current = queueKey;
          readerLog('agent.queue.play', {
            annotationId: annotation.id,
            agent: queueKey,
            remaining: queuedAnnotationsCount(),
          });
          const session = annotation.agentId
            ? virtualReadingSessionsRef.current.get(annotation.agentId)
            : undefined;
          if (session) session.paused = true;
          await playAgentAnnotation(annotation);
        } catch (error) {
          readerLog('agent.queue.play.error', {
            annotationId: annotation.id,
            error: error instanceof Error ? error.message : String(error),
          });
          await saveAnnotations([...annotationsRef.current, annotation]);
        } finally {
          const session = annotation.agentId
            ? virtualReadingSessionsRef.current.get(annotation.agentId)
            : undefined;
          if (session) session.paused = false;
          cleanupAgentQueue(queueKey);
          if (queueKey && shouldWaitForPeerAgent(queueKey)) await sleep(900);
        }
      }
    } finally {
      agentAnimationRunningRef.current = false;
      setAgentTheaterBoxes([]);
      finishVirtualReadingIfIdle();
    }
  }

  async function playAgentAnnotation(annotation: Annotation) {
    const article = articleRef.current;
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    const cursorAgent = annotationToAgent(annotation);
    const cursorId =
      cursorAgent?.id || annotation.agentId || annotation.agentUsername || annotation.id;
    if (!article || !canvas || !surface) {
      readerLog('agent.play.no_surface', { annotationId: annotation.id });
      await saveAnnotations([...annotationsRef.current, annotation]);
      return;
    }

    const position = resolveTextAnchor(article.textContent || '', annotation.anchor);
    if (!position) {
      readerLog('agent.play.anchor_unresolved', {
        annotationId: annotation.id,
        exact: annotation.anchor.exact.slice(0, 80),
      });
      await saveAnnotations([...annotationsRef.current, annotation]);
      return;
    }

    const range = rangeFromOffsets(article, position.start, position.end);
    if (!range) {
      readerLog('agent.play.range_missing', { annotationId: annotation.id });
      await saveAnnotations([...annotationsRef.current, annotation]);
      return;
    }

    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width >= 2 && rect.height >= 2,
    );
    const firstRect = rects[0];
    const lastRect = rects[rects.length - 1];
    if (!firstRect || !lastRect) return;

    const surfaceRect = surface.getBoundingClientRect();
    const isVisible = firstRect.bottom >= surfaceRect.top && firstRect.top <= surfaceRect.bottom;
    if (!isVisible) {
      updateVirtualCursor(cursorId, {
        id: cursorId,
        visible: true,
        x: surfaceRect.left + surfaceRect.width / 2,
        y: firstRect.top < surfaceRect.top ? surfaceRect.top + 18 : surfaceRect.bottom - 18,
        label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在${firstRect.top < surfaceRect.top ? '上方' : '下方'}批注`,
        offscreen: firstRect.top < surfaceRect.top ? 'above' : 'below',
        agent: cursorAgent,
      });
      await sleep(700);
      await saveAnnotations([...annotationsRef.current, annotation]);
      setActiveId(annotation.id);
      return;
    }

    updateVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: firstRect.left,
      y: firstRect.top + firstRect.height / 2,
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(420);

    const theaterBoxes = rangeHighlightBoxes(
      range,
      canvas.getBoundingClientRect(),
      `theater_${annotation.id}`,
    ).map((box) =>
      Object.assign({}, box, { annotationId: annotation.id, color: annotation.color }),
    );
    await animateTheaterHighlight(theaterBoxes, annotation.anchor.exact.length, (nextBoxes) => {
      const cursorBox = nextBoxes[nextBoxes.length - 1];
      if (cursorBox) {
        const canvasRect = canvas.getBoundingClientRect();
        updateVirtualCursor(cursorId, {
          id: cursorId,
          visible: true,
          x: canvasRect.left + cursorBox.left + cursorBox.width,
          y: canvasRect.top + cursorBox.top + cursorBox.height / 2,
          label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
          offscreen: null,
          agent: cursorAgent,
        });
      }
      setAgentTheaterBoxes(nextBoxes);
    });

    await saveAnnotations([...annotationsRef.current, annotation]);
    setActiveId(annotation.id);
    setAgentTheaterBoxes([]);
    updateVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: lastRect.right,
      y: lastRect.top + lastRect.height / 2,
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 继续阅读`,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(360);
  }

  function markVirtualReadingDone(agentId: string) {
    const session = virtualReadingSessionsRef.current.get(agentId);
    if (session) session.done = true;
  }

  function cleanupVirtualReadingSessions() {
    for (const session of virtualReadingSessionsRef.current.values()) {
      window.clearInterval(session.timerId);
    }
    virtualReadingSessionsRef.current.clear();
    virtualCursorRef.current.clear();
    setVirtualCursors([]);
  }

  return {
    agentTheaterBoxes,
    annotatingAgents,
    virtualCursors,
    cleanupVirtualReadingSessions,
    enqueueAgentAnnotation,
    finishVirtualReading,
    finishVirtualReadingIfIdle,
    markAgentAnnotating,
    markVirtualReadingDone,
    processAgentAnnotationQueue,
    startVirtualReading,
  };
}
