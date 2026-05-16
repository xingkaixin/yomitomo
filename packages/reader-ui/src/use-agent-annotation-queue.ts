import React, { useEffect, useRef, useState } from 'react';
import type { AgentReadingPlanItem, Annotation, PublicAgent } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import { annotationToPublicAgent as annotationToAgent } from '@yomitomo/core';
import {
  cursorPositionFromOffset,
  offsetFromArticleStart,
  rangeFromOffsets,
  rangeHighlightBoxes,
  type HighlightBox,
} from '@yomitomo/core';
import type { VirtualCursorState } from './reader-types';
import { useAgentReadingDock } from './use-agent-reading-dock';
import { agentQueueKey, animateTheaterHighlight, sleep } from './reader-utils';

type VirtualReadingSession = {
  agent: PublicAgent;
  timerId: number;
  offset: number;
  paused: boolean;
  done: boolean;
  mode: VirtualReadingMode;
  step: number;
  sections: VirtualReadingSection[];
  sectionIndex: number;
};

type VirtualReadingMode = 'article' | 'careful' | 'target';

type VirtualReadingSection = {
  start: number;
  end: number;
};

type UseAgentAnnotationQueueOptions = {
  agents: PublicAgent[];
  articleRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  articleBodySelector?: string;
  annotationsRef: React.MutableRefObject<Annotation[]>;
  saveAnnotations: (annotations: Annotation[]) => void | Promise<void>;
  setActiveId: (annotationId: string) => void;
  readerLog: (event: string, data?: Record<string, unknown>) => void;
};

function normalizedReadingSections(readingPlan: AgentReadingPlanItem[]) {
  return readingPlan
    .map((item) => ({
      start: Math.max(0, item.sectionStart),
      end: Math.max(0, item.sectionEnd),
    }))
    .filter((section) => section.end > section.start)
    .toSorted((left, right) => left.start - right.start);
}

function currentReadingSection(session: VirtualReadingSession) {
  return session.sections[session.sectionIndex] || null;
}

function nextReadingOffset(session: VirtualReadingSession, textLength: number) {
  if (!session.sections.length) return session.offset + session.step;

  let section = currentReadingSection(session);
  if (!section) {
    session.sectionIndex = 0;
    section = currentReadingSection(session);
  }
  if (!section) return session.offset + session.step;

  const nextOffset = session.offset + session.step;
  if (nextOffset < section.end - 1) return Math.max(section.start, nextOffset);

  session.sectionIndex = (session.sectionIndex + 1) % session.sections.length;
  const nextSection = currentReadingSection(session);
  return Math.min(Math.max(nextSection?.start || 0, 0), Math.max(0, textLength - 1));
}

function usesAgentDock(mode: VirtualReadingMode) {
  return mode === 'careful' || mode === 'target';
}

export function useAgentAnnotationQueue({
  agents,
  articleRef,
  canvasRef,
  surfaceRef,
  articleBodySelector = '.reader-article-body',
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
  const activeDockReadingIdsRef = useRef(new Set<string>());
  const dockReadingHadFailureRef = useRef(false);
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [annotatingAgents, setAnnotatingAgents] = useState<string[]>([]);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);
  const {
    agentDockCompleting,
    agentDockItems,
    completionBurstKey,
    activateAgentDock,
    markAgentDockDone,
    completeAgentDock,
    clearAgentDock,
  } = useAgentReadingDock(agents);

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

  function startVirtualReading(
    agent: PublicAgent,
    readingPlan: AgentReadingPlanItem[] = [],
    mode: VirtualReadingMode = readingPlan.length > 0 ? 'careful' : 'article',
  ) {
    const currentSession = virtualReadingSessionsRef.current.get(agent.id);
    if (currentSession) {
      window.clearInterval(currentSession.timerId);
      if (usesAgentDock(currentSession.mode)) activeDockReadingIdsRef.current.delete(agent.id);
    }

    const article = articleRef.current;
    const body = article?.querySelector(articleBodySelector);
    const sessionIndex = virtualReadingSessionsRef.current.size;
    const sections = normalizedReadingSections(readingPlan);
    const firstSection = sections[0];
    const interval =
      mode === 'target'
        ? 190 + Math.floor(Math.random() * 110)
        : 150 + Math.floor(Math.random() * 90);
    const step =
      mode === 'target'
        ? 3 + Math.floor(Math.random() * 6)
        : 5 + sessionIndex * 2 + Math.floor(Math.random() * 8);
    const baseOffset = firstSection
      ? firstSection.start
      : article && body
        ? offsetFromArticleStart(article, body, 0)
        : 0;
    const session: VirtualReadingSession = {
      agent,
      timerId: 0,
      offset: firstSection || mode === 'target' ? baseOffset : baseOffset + sessionIndex * 18,
      paused: false,
      done: false,
      mode,
      step,
      sections,
      sectionIndex: 0,
    };
    if (usesAgentDock(mode)) {
      activeDockReadingIdsRef.current.add(agent.id);
      activateAgentDock(agent);
    }
    virtualReadingSessionsRef.current.set(agent.id, session);
    tickVirtualReading(agent.id);
    session.timerId = window.setInterval(() => tickVirtualReading(agent.id), interval);
    readerLog('virtual.reading.start', { agent: agent.username, mode });
  }

  function tickVirtualReading(agentId: string) {
    const session = virtualReadingSessionsRef.current.get(agentId);
    if (!session || session.paused) return;

    const article = articleRef.current;
    const surface = surfaceRef.current;
    if (!article || !surface) return;

    const text = article.textContent || '';
    if (
      session.mode !== 'target' &&
      !session.sections.length &&
      session.offset >= text.length - 1
    ) {
      finishVirtualReading(agentId, '读完了');
      return;
    }

    const section = currentReadingSection(session);
    const nextOffset = nextReadingOffset(session, text.length);
    const position = cursorPositionFromOffset(article, surface, nextOffset, section?.end);
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
    if (session && usesAgentDock(session.mode)) markAgentDockDone(agentId);
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
    if (!current) {
      finishAgentDockReading(agentId, session);
      return;
    }

    updateVirtualCursor(agentId, {
      ...current,
      x: Math.min(window.innerWidth - 80, current.x + 72),
      y: Math.max(72, current.y - 42),
      label: `${session?.agent.nickname || current.agent?.nickname || '助手'} ${suffix}`,
      leaving: true,
    });
    window.setTimeout(() => {
      updateVirtualCursor(agentId, null);
      finishAgentDockReading(agentId, session);
    }, 900);
  }

  function finishAgentDockReading(agentId: string, session: VirtualReadingSession | undefined) {
    if (!session || !usesAgentDock(session.mode)) return;
    activeDockReadingIdsRef.current.delete(agentId);
    if (!session.done) dockReadingHadFailureRef.current = true;
    triggerAgentDockCompletionIfDone();
  }

  function triggerAgentDockCompletionIfDone() {
    if (activeDockReadingIdsRef.current.size > 0) return;
    const shouldCelebrate = !dockReadingHadFailureRef.current;
    dockReadingHadFailureRef.current = false;
    completeAgentDock(shouldCelebrate);
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
      if (virtualReadingSessionsRef.current.get(cursorId)?.mode === 'target') {
        finishVirtualReading(cursorId);
      }
      return;
    }

    const session = virtualReadingSessionsRef.current.get(cursorId);
    const cursor = virtualCursorRef.current.get(cursorId);
    if (session?.mode === 'target' && cursor) {
      updateVirtualCursor(cursorId, {
        ...cursor,
        label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
        offscreen: null,
        agent: cursorAgent,
      });
      await sleep(160);
    } else {
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
    }

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
    const currentSession = virtualReadingSessionsRef.current.get(cursorId);
    if (currentSession?.mode === 'target') {
      finishVirtualReading(cursorId);
      return;
    }
    const hasReadingSession = Boolean(currentSession);
    updateVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: lastRect.right,
      y: lastRect.top + lastRect.height / 2,
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} ${hasReadingSession ? '继续阅读' : '批注完成'}`,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(360);
    if (!hasReadingSession) finishVirtualReading(cursorId);
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
    clearAgentDock();
    activeDockReadingIdsRef.current.clear();
    dockReadingHadFailureRef.current = false;
    setVirtualCursors([]);
  }

  return {
    agentDockCompleting,
    agentDockItems,
    agentTheaterBoxes,
    annotatingAgents,
    completionBurstKey,
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
