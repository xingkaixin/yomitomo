import React, { useEffect, useRef, useState } from 'react';
import type { Annotation, PublicAgent } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import { AgentAnnotationQueue } from './reader-agent-annotation-queue';
import {
  playAgentAnnotationPlayback,
  saveAgentAnnotationAsThought,
} from './reader-agent-annotation-playback';
import { useAgentVirtualReading } from './use-agent-virtual-reading';
import { sleep } from '../reader-animation';

type UseAgentAnnotationQueueOptions = {
  agents: PublicAgent[];
  articleRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  articleBodySelector?: string;
  annotationsRef: React.MutableRefObject<Annotation[]>;
  saveAnnotation: (annotation: Annotation) => void | Promise<void>;
  setActiveId: (annotationId: string) => void;
  readerLog: (event: string, data?: Record<string, unknown>) => void;
};

export function useAgentAnnotationQueue({
  agents,
  articleRef,
  canvasRef,
  surfaceRef,
  articleBodySelector = '.reader-article-body',
  annotationsRef,
  saveAnnotation,
  setActiveId,
  readerLog,
}: UseAgentAnnotationQueueOptions) {
  const agentAnnotationQueueRef = useRef(new AgentAnnotationQueue());
  const agentAnimationRunningRef = useRef(false);
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [annotatingAgents, setAnnotatingAgents] = useState<string[]>([]);
  const virtualReading = useAgentVirtualReading({
    agents,
    articleRef,
    surfaceRef,
    articleBodySelector,
    hasQueuedAnnotationForAgent: (agentId) =>
      agentAnnotationQueueRef.current.hasQueuedForAgent(agentId),
    isAnnotationPlaybackRunning: () => agentAnimationRunningRef.current,
    readerLog,
  });

  useEffect(() => {
    setAnnotatingAgents((ids) => ids.filter((id) => agents.some((agent) => agent.id === id)));
  }, [agents]);

  function enqueueAgentAnnotation(annotation: Annotation) {
    const key = agentAnnotationQueueRef.current.enqueue(annotation);
    readerLog('agent.queue.enqueue', {
      annotationId: annotation.id,
      agent: key,
      size: agentAnnotationQueueRef.current.count(),
    });
  }

  function markAgentAnnotating(agentId: string, annotating: boolean) {
    setAnnotatingAgents((ids) => {
      if (annotating) return ids.includes(agentId) ? ids : [...ids, agentId];
      return ids.filter((id) => id !== agentId);
    });
  }

  async function processAgentAnnotationQueue() {
    if (agentAnimationRunningRef.current) return;

    agentAnimationRunningRef.current = true;
    try {
      while (agentAnnotationQueueRef.current.count() > 0) {
        const item = agentAnnotationQueueRef.current.dequeueNext();
        if (!item) break;

        try {
          readerLog('agent.queue.play', {
            annotationId: item.annotation.id,
            agent: item.key,
            remaining: agentAnnotationQueueRef.current.count(),
          });
          virtualReading.pauseVirtualReading(item.annotation.agentId);
          await playAgentAnnotationPlayback({
            annotation: item.annotation,
            articleRef,
            canvasRef,
            surfaceRef,
            annotationsRef,
            saveAnnotation,
            setActiveId,
            setAgentTheaterBoxes,
            getVirtualCursor: virtualReading.getVirtualCursor,
            getVirtualReadingMode: virtualReading.getVirtualReadingMode,
            updateVirtualCursor: virtualReading.updateVirtualCursor,
            finishVirtualReading: virtualReading.finishVirtualReading,
            readerLog,
          });
        } catch (error) {
          readerLog('agent.queue.play.error', {
            annotationId: item.annotation.id,
            error: error instanceof Error ? error.message : String(error),
          });
          await saveAgentAnnotationAsThought({
            annotation: item.annotation,
            annotationsRef,
            saveAnnotation,
          });
        } finally {
          virtualReading.resumeVirtualReading(item.annotation.agentId);
          agentAnnotationQueueRef.current.cleanup(
            item.key,
            virtualReading.hasVirtualReadingSession(item.key),
          );
          if (
            agentAnnotationQueueRef.current.shouldWaitForPeerReading(
              item.key,
              virtualReading.hasUnfinishedPeerReading(item.key),
            )
          ) {
            await sleep(900);
          }
        }
      }
    } finally {
      agentAnimationRunningRef.current = false;
      setAgentTheaterBoxes([]);
      virtualReading.finishVirtualReadingIfIdle();
    }
  }

  return {
    agentDockCompleting: virtualReading.agentDockCompleting,
    agentDockItems: virtualReading.agentDockItems,
    agentTheaterBoxes,
    annotatingAgents,
    completionBurstKey: virtualReading.completionBurstKey,
    virtualCursors: virtualReading.virtualCursors,
    cleanupVirtualReadingSessions: virtualReading.cleanupVirtualReadingSessions,
    enqueueAgentAnnotation,
    finishVirtualReading: virtualReading.finishVirtualReading,
    finishVirtualReadingIfIdle: virtualReading.finishVirtualReadingIfIdle,
    markAgentAnnotating,
    markVirtualReadingDone: virtualReading.markVirtualReadingDone,
    processAgentAnnotationQueue,
    startVirtualReading: virtualReading.startVirtualReading,
  };
}
