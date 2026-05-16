import React, { useRef, useState } from 'react';
import type { AgentReadingPlanItem, PublicAgent } from '@yomitomo/shared';
import { cursorPositionFromOffset, offsetFromArticleStart } from '@yomitomo/core';
import type { VirtualCursorState } from './reader-types';
import { useAgentReadingDock } from './use-agent-reading-dock';
import {
  currentReadingSection,
  nextReadingOffset,
  normalizedReadingSections,
  usesAgentDock,
  type VirtualReadingMode,
  type VirtualReadingSession,
} from './reader-agent-virtual-reading';

type UseAgentVirtualReadingOptions = {
  agents: PublicAgent[];
  articleRef: React.RefObject<HTMLElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  articleBodySelector: string;
  hasQueuedAnnotationForAgent: (agentId: string) => boolean;
  isAnnotationPlaybackRunning: () => boolean;
  readerLog: (event: string, data?: Record<string, unknown>) => void;
};

export function useAgentVirtualReading({
  agents,
  articleRef,
  surfaceRef,
  articleBodySelector,
  hasQueuedAnnotationForAgent,
  isAnnotationPlaybackRunning,
  readerLog,
}: UseAgentVirtualReadingOptions) {
  const virtualReadingSessionsRef = useRef(new Map<string, VirtualReadingSession>());
  const virtualCursorRef = useRef(new Map<string, VirtualCursorState>());
  const activeDockReadingIdsRef = useRef(new Set<string>());
  const dockReadingHadFailureRef = useRef(false);
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
    const next = nextReadingOffset(session, text.length);
    session.sectionIndex = next.sectionIndex;
    const position = cursorPositionFromOffset(article, surface, next.offset, section?.end);
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
    if (isAnnotationPlaybackRunning()) return;
    window.setTimeout(() => {
      if (isAnnotationPlaybackRunning()) return;
      for (const id of agentIds) {
        const session = virtualReadingSessionsRef.current.get(id);
        if (session?.done && !hasQueuedAnnotationForAgent(id)) {
          finishVirtualReading(id);
        }
      }
    }, 900);
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

  function pauseVirtualReading(agentId: string | undefined) {
    const session = agentId ? virtualReadingSessionsRef.current.get(agentId) : undefined;
    if (session) session.paused = true;
  }

  function resumeVirtualReading(agentId: string | undefined) {
    const session = agentId ? virtualReadingSessionsRef.current.get(agentId) : undefined;
    if (session) session.paused = false;
  }

  function hasVirtualReadingSession(agentId: string) {
    return virtualReadingSessionsRef.current.has(agentId);
  }

  function hasUnfinishedPeerReading(agentId: string) {
    for (const [key, session] of virtualReadingSessionsRef.current) {
      if (key !== agentId && !session.done) return true;
    }
    return false;
  }

  function getVirtualReadingMode(agentId: string) {
    return virtualReadingSessionsRef.current.get(agentId)?.mode;
  }

  function getVirtualCursor(agentId: string) {
    return virtualCursorRef.current.get(agentId);
  }

  return {
    agentDockCompleting,
    agentDockItems,
    completionBurstKey,
    virtualCursors,
    cleanupVirtualReadingSessions,
    finishVirtualReading,
    finishVirtualReadingIfIdle,
    getVirtualCursor,
    getVirtualReadingMode,
    hasUnfinishedPeerReading,
    hasVirtualReadingSession,
    markVirtualReadingDone,
    pauseVirtualReading,
    resumeVirtualReading,
    startVirtualReading,
    updateVirtualCursor,
  };
}
