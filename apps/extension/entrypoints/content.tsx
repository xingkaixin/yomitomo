import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  type Annotation,
  type AnnotationType,
  type AgentReadingPlanItem,
  type AgentReadingIntent,
  type ArticleRecord,
  type Comment,
  type DesktopClientMessage,
  type DesktopServerMessage,
  type PublicAgent,
  type QuestionStatus,
  type UserProfile,
  createTextAnchor,
  makeId,
  resolveTextAnchor,
} from '@yomitomo/shared';
import {
  annotationColor,
  annotationIdsAtHighlightPoint,
  appendAnnotationComment,
  createUserAnnotation,
  createUserComment,
  findMentionedAgents,
  updateAnnotationComment,
} from '@yomitomo/core';
import {
  type ExtractedArticle,
  articlePreviewFromExtractedArticle,
  extractCurrentArticle,
  fallbackCurrentArticle,
} from '../src/article-extraction';
import {
  type HighlightBox,
  type TocItem,
  extractTocItems,
  findCurrentTocTarget,
  getArticleSelection,
  isRangeInsideArticle,
  offsetFromArticleStart,
  rangeFromOffsets,
  rangeHighlightBoxes,
  scrollReaderSurfaceToElement,
  scrollReaderSurfaceToRect,
  selectionActionPosition,
} from '../src/reader-dom';
import type { ActiveConnection, ReaderReadingSection } from '../src/reader-components';
import type { PendingAgentAnnotation } from '../src/reader-components';
import { readerConversationStyles, readerStyles } from '../src/reader-styles';
import {
  buildTocAnnotationStats,
  defaultReaderSettings,
  defaultUserProfile,
  getShortcutModifier,
  applyAgentCommentDelta,
  normalizeUserProfile,
} from '../src/reader-utils';
import {
  DESKTOP_BRIDGE_PORT_NAME,
  DESKTOP_PAIRING_ID_KEY,
  DESKTOP_PAIRING_TOKEN_KEY,
  type DesktopBridge,
  type DesktopBridgeContentMessage,
  type DesktopBridgePortMessage,
} from '../src/desktop-bridge';
import {
  addExtensionMessageListener,
  connectExtensionPort,
  readExtensionStorage,
  removeExtensionStorage,
  writeExtensionStorage,
} from '../src/extension-runtime';
import { registerContentToggleListener } from '../src/content-runtime';
import {
  ReaderAppView,
  type HighlightChoice,
  type PendingComposer,
  type SelectionAction,
} from '../src/reader-app-view';
import { useAgentAnnotationQueue } from '../src/use-agent-annotation-queue';
import { useArticleRecordSync } from '../src/use-article-record-sync';

const HOST_ID = 'yomitomo-root';
let root: Root | null = null;
let previousOverflow = '';

function readerLog(event: string, data?: Record<string, unknown>) {
  console.log('[Yomitomo Extension]', event, data || '');
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    registerContentToggleListener({
      addListener: addExtensionMessageListener,
      getArticlePreview,
      toggleReader,
      errorMessage,
    });
  },
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function toggleReader() {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    closeReader(existing);
    return;
  }

  const article = await extractCurrentArticle().catch((error: unknown) => {
    console.error('[Yomitomo Extension] article extraction failed', error);
    return fallbackCurrentArticle();
  });
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  document.documentElement.append(host);

  previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${readerStyles}\n${readerConversationStyles}`;
  const mount = document.createElement('div');
  shadow.append(style, mount);

  root = createRoot(mount);
  root.render(<ReaderApp extracted={article} onClose={() => closeReader(host)} />);
}

async function getArticlePreview() {
  const article = await extractCurrentArticle();
  return articlePreviewFromExtractedArticle(article);
}

function closeReader(host: HTMLElement) {
  root?.unmount();
  root = null;
  host.remove();
  document.documentElement.style.overflow = previousOverflow;
}

function buildReaderReadingSections(
  article: HTMLElement,
  tocItems: TocItem[],
  articleTitle: string,
): ReaderReadingSection[] {
  const body = article.querySelector('.reader-article-body');
  const bodyStart = body ? offsetFromArticleStart(article, body, 0) : 0;
  const bodyTocItems = tocItems.filter(
    (item) => item.start >= bodyStart && !isArticleTitleTocItem(item, articleTitle, bodyStart),
  );

  if (bodyTocItems.length > 0) {
    const targetDepth = Math.min(...bodyTocItems.map((item) => item.depth));
    const sections = bodyTocItems
      .filter((item) => item.depth === targetDepth)
      .map((item) => ({
        id: `toc-${item.index}`,
        title: item.text,
        start: item.start,
        end: item.end,
      }));
    const firstSection = sections[0];
    const articleText = article.textContent || '';
    const hasPreface =
      firstSection &&
      firstSection.start > bodyStart &&
      articleText.slice(bodyStart, firstSection.start).trim();

    return hasPreface
      ? [
          {
            id: 'preface',
            title: '引文',
            start: bodyStart,
            end: firstSection.start,
          },
          ...sections,
        ]
      : sections;
  }

  return [
    {
      id: 'body',
      title: '正文',
      start: bodyStart,
      end: article.textContent?.length || bodyStart,
    },
  ];
}

function isArticleTitleTocItem(item: TocItem, articleTitle: string, bodyStart: number) {
  return (
    item.start <= bodyStart + 8 &&
    normalizeHeadingText(item.text) === normalizeHeadingText(articleTitle)
  );
}

function normalizeHeadingText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ReaderApp({ extracted, onClose }: { extracted: ExtractedArticle; onClose: () => void }) {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const desktopBridgeRef = useRef<DesktopBridge | null>(null);
  const desktopAuthenticatedRef = useRef(false);
  const desktopInitialSyncRef = useRef(false);
  const pairingFailureRef = useRef('');
  const annotationsRef = useRef<Annotation[]>([]);
  const articleRecordRef = useRef<ArticleRecord | null>(null);
  const recordCreatedAtRef = useRef<string | null>(null);
  const pendingAgentRequestsRef = useRef(
    new Map<
      string,
      {
        annotationId: string;
        commentId: string;
        agentId?: string;
        annotationCount?: number;
        pendingAnnotationId?: string;
        readingPlan?: AgentReadingPlanItem[];
      }
    >(),
  );
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [desktopConnected, setDesktopConnected] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(defaultUserProfile);
  const [agents, setAgents] = useState<PublicAgent[]>([]);
  const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(null);
  const [highlightChoice, setHighlightChoice] = useState<HighlightChoice | null>(null);
  const [composer, setComposer] = useState<PendingComposer | null>(null);
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [readingSections, setReadingSections] = useState<ReaderReadingSection[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readerSettings, setReaderSettings] = useState(defaultReaderSettings);
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);
  const [pendingAgentAnnotations, setPendingAgentAnnotations] = useState<PendingAgentAnnotation[]>(
    [],
  );
  const [pairingLoaded, setPairingLoaded] = useState(false);
  const [pairingToken, setPairingToken] = useState('');
  const [pairingTokenDraft, setPairingTokenDraft] = useState('');
  const [pairingId, setPairingId] = useState('');
  const [pairingStatus, setPairingStatus] = useState('未配对');

  const {
    applyAnnotations,
    applyDeletedArticleRecord,
    applyDesktopArticleRecord,
    cacheDesktopProfile,
    commitAnnotations,
    requestDesktopArticleRecord,
    saveAnnotations,
    updateReaderSettings,
  } = useArticleRecordSync({
    extracted,
    desktopBridgeRef,
    desktopAuthenticatedRef,
    annotationsRef,
    articleRecordRef,
    recordCreatedAtRef,
    setAnnotations,
    setAgents,
    setReaderSettings,
    setUserProfile,
    normalizeUserProfile,
    readerLog,
    errorMessage,
  });

  const {
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
  } = useAgentAnnotationQueue({
    agents,
    articleRef,
    canvasRef,
    surfaceRef,
    annotationsRef,
    saveAnnotations: (nextAnnotations) => saveAnnotations(nextAnnotations),
    setActiveId,
    readerLog,
  });
  const shortcutModifier = getShortcutModifier();
  const annotationTotals = useMemo(
    () => ({
      annotations: annotations.length,
      comments: annotations.reduce((count, annotation) => count + annotation.comments.length, 0),
    }),
    [annotations],
  );
  const tocAnnotationStats = useMemo(
    () => buildTocAnnotationStats(tocItems, annotations, userProfile, agents),
    [agents, annotations, tocItems, userProfile],
  );
  const filteredAnnotations = annotations;

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    readExtensionStorage([DESKTOP_PAIRING_TOKEN_KEY, DESKTOP_PAIRING_ID_KEY])
      .then((stored) => {
        if (!stored) return;
        const token =
          typeof stored[DESKTOP_PAIRING_TOKEN_KEY] === 'string'
            ? stored[DESKTOP_PAIRING_TOKEN_KEY]
            : '';
        const savedPairingId =
          typeof stored[DESKTOP_PAIRING_ID_KEY] === 'string' ? stored[DESKTOP_PAIRING_ID_KEY] : '';
        setPairingToken(token);
        setPairingTokenDraft(token);
        setPairingId(savedPairingId);
        setPairingStatus(token ? '正在连接' : '未配对');
      })
      .catch((error: unknown) => {
        readerLog('pairing.load.error', { message: errorMessage(error) });
        setPairingStatus('读取配对码失败');
      })
      .finally(() => setPairingLoaded(true));
  }, []);

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const nextTocItems = extractTocItems(article);
    setTocItems(nextTocItems);
    setReadingSections(buildReaderReadingSections(article, nextTocItems, extracted.title));
  }, [extracted.content]);

  useEffect(() => {
    if (!activeId) return;
    if (filteredAnnotations.some((annotation) => annotation.id === activeId)) return;
    setActiveId(filteredAnnotations[0]?.id || null);
  }, [activeId, filteredAnnotations]);

  useEffect(() => {
    if (!highlightChoice) return;
    const annotationIds = new Set(annotations.map((annotation) => annotation.id));
    if (highlightChoice.annotationIds.every((id) => annotationIds.has(id))) return;
    setHighlightChoice(null);
  }, [annotations, highlightChoice]);

  const recalculateHighlights = useCallback(() => {
    const article = articleRef.current;
    const canvas = canvasRef.current;
    if (!article || !canvas) return;

    const articleText = article.textContent || '';
    const canvasRect = canvas.getBoundingClientRect();
    const nextBoxes: HighlightBox[] = [];

    for (const annotation of annotations) {
      const position = resolveTextAnchor(articleText, annotation.anchor);
      if (!position) continue;

      const range = rangeFromOffsets(article, position.start, position.end);
      if (!range) continue;

      rangeHighlightBoxes(range, canvasRect, annotation.id).forEach((box) => {
        nextBoxes.push({
          ...box,
          annotationId: annotation.id,
          color: annotationColor(annotation, userProfile, agents),
        });
      });
    }

    setBoxes(nextBoxes);
  }, [agents, annotations, userProfile]);

  const recalculateActiveConnection = useCallback(() => {
    if (!activeId) {
      setActiveConnection(null);
      return;
    }

    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    const note = noteRefs.current.get(activeId);
    const annotation = annotations.find((item) => item.id === activeId);
    const activeBoxes = boxes.filter((box) => box.annotationId === activeId);
    if (!canvas || !surface || !note || !annotation || activeBoxes.length === 0) {
      setActiveConnection(null);
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const noteRect = note.getBoundingClientRect();
    const noteY = noteRect.top + Math.min(72, noteRect.height / 2);
    const box = activeBoxes.toSorted((left, right) => {
      const leftY = canvasRect.top + left.top + left.height / 2;
      const rightY = canvasRect.top + right.top + right.height / 2;
      return Math.abs(leftY - noteY) - Math.abs(rightY - noteY);
    })[0];
    if (!box) {
      setActiveConnection(null);
      return;
    }

    const startX = canvasRect.left + box.left + box.width + 6;
    const startY = canvasRect.top + box.top + box.height / 2;
    const endX = noteRect.left - 8;
    const endY = noteY;
    const highlightVisible = startY >= surfaceRect.top - 24 && startY <= surfaceRect.bottom + 24;
    const noteVisible =
      noteRect.bottom >= surfaceRect.top + 24 && noteRect.top <= surfaceRect.bottom - 24;
    if (!highlightVisible || !noteVisible) {
      setActiveConnection(null);
      return;
    }

    const direction = endX >= startX ? 1 : -1;
    const tension = Math.max(48, Math.abs(endX - startX) * 0.42);
    const path = `M ${startX} ${startY} C ${startX + tension * direction} ${startY}, ${endX - tension * direction} ${endY}, ${endX} ${endY}`;
    const color = annotationColor(annotation, userProfile, agents);
    setActiveConnection((current) =>
      current?.path === path && current.color === color ? current : { path, color },
    );
  }, [activeId, agents, annotations, boxes, userProfile]);

  useEffect(() => {
    if (!pairingLoaded) return;
    if (!pairingToken.trim()) {
      desktopAuthenticatedRef.current = false;
      desktopInitialSyncRef.current = false;
      setPairingId('');
      setDesktopConnected(false);
      setAgents([]);
      setPairingStatus('未配对');
      return;
    }

    let closed = false;
    let reconnectTimer = 0;

    const connect = () => {
      const port = connectExtensionPort(DESKTOP_BRIDGE_PORT_NAME);
      if (!port) return;
      let portClosed = false;
      const bridge: DesktopBridge = {
        readyState: WebSocket.CONNECTING,
        send(message) {
          port.postMessage({ type: 'desktop:send', message } satisfies DesktopBridgePortMessage);
        },
        close() {
          port.postMessage({ type: 'desktop:disconnect' } satisfies DesktopBridgePortMessage);
          port.disconnect();
        },
      };
      desktopBridgeRef.current = bridge;
      desktopAuthenticatedRef.current = false;
      pairingFailureRef.current = '';
      setPairingStatus('正在连接');

      function handleClose() {
        if (portClosed) return;
        portClosed = true;
        bridge.readyState = WebSocket.CLOSED;
        if (desktopBridgeRef.current === bridge) desktopBridgeRef.current = null;
        port.disconnect();
        if (closed) return;

        readerLog('ws.close');
        if (hasPendingAgentComment()) commitAnnotations();
        clearPendingAgentRequests('连接中断');
        desktopAuthenticatedRef.current = false;
        desktopInitialSyncRef.current = false;
        setDesktopConnected(false);
        setPairingStatus(
          pairingFailureRef.current || (pairingToken.trim() ? '桌面端未连通' : '未配对'),
        );
        if (!closed && !pairingFailureRef.current) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      }

      port.onMessage.addListener((message: DesktopBridgeContentMessage) => {
        if (message.type === 'desktop:open') {
          bridge.readyState = WebSocket.OPEN;
          readerLog('ws.open');
          return;
        }

        if (message.type === 'desktop:message') {
          readerLog('ws.message', {
            type: message.message.type,
            requestId: 'requestId' in message.message ? message.message.requestId : undefined,
          });
          void handleDesktopMessage(message.message);
          return;
        }

        if (message.type === 'desktop:error') {
          readerLog('ws.error', { message: message.message });
          clearPendingAgentRequests('连接中断');
          desktopAuthenticatedRef.current = false;
          desktopInitialSyncRef.current = false;
          setDesktopConnected(false);
          return;
        }

        if (message.type === 'desktop:close') handleClose();
      });

      port.onDisconnect.addListener(handleClose);
      port.postMessage({
        type: 'desktop:connect',
        token: pairingToken.trim(),
      } satisfies DesktopBridgePortMessage);
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      if (hasPendingAgentComment()) commitAnnotations();
      cleanupVirtualReadingSessions();
      desktopAuthenticatedRef.current = false;
      desktopInitialSyncRef.current = false;
      desktopBridgeRef.current?.close();
      desktopBridgeRef.current = null;
    };
  }, [commitAnnotations, pairingLoaded, pairingToken, saveAnnotations]);

  useEffect(() => {
    const commitPendingAgentComment = () => {
      if (hasPendingAgentComment()) commitAnnotations();
    };

    window.addEventListener('beforeunload', commitPendingAgentComment);
    return () => {
      window.removeEventListener('beforeunload', commitPendingAgentComment);
    };
  }, [commitAnnotations]);

  useLayoutEffect(() => {
    recalculateHighlights();
  }, [recalculateHighlights, readerSettings]);

  useLayoutEffect(() => {
    recalculateActiveConnection();
  }, [recalculateActiveConnection]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recalculateHighlights);
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (canvasRef.current) resizeObserver?.observe(canvasRef.current);
    if (articleRef.current) resizeObserver?.observe(articleRef.current);

    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateHighlights]);

  useEffect(() => {
    const surface = surfaceRef.current;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recalculateActiveConnection);
    };

    surface?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      surface?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateActiveConnection]);

  function sendDesktopMessage(message: DesktopClientMessage) {
    const bridge = desktopBridgeRef.current;
    if (!desktopAuthenticatedRef.current) return;
    if (!bridge || bridge.readyState !== WebSocket.OPEN) return;
    bridge.send(message);
  }

  async function handleDesktopMessage(message: DesktopServerMessage) {
    if (message.type === 'auth:result') {
      desktopAuthenticatedRef.current = message.ok;
      setDesktopConnected(message.ok);
      if (message.ok && message.pairingId) {
        setPairingId(message.pairingId);
        await writeExtensionStorage({ [DESKTOP_PAIRING_ID_KEY]: message.pairingId });
      }
      setPairingStatus(message.ok ? '已配对' : message.message || '配对失败');
      desktopInitialSyncRef.current = false;
      if (!message.ok) {
        pairingFailureRef.current = message.message || '配对失败';
        return;
      }

      sendDesktopMessage({ type: 'hello' });
      return;
    }

    if (message.type === 'status' || message.type === 'agent:list:result') {
      const user = normalizeUserProfile(message.user);
      setDesktopConnected(message.type === 'status' ? message.ok : true);
      if (message.type === 'status') {
        setPairingId(message.pairingId);
        await writeExtensionStorage({ [DESKTOP_PAIRING_ID_KEY]: message.pairingId });
      }
      setUserProfile(user);
      setAgents(message.agents);
      await cacheDesktopProfile(user, message.agents);
      if (message.type === 'status' && !desktopInitialSyncRef.current) {
        desktopInitialSyncRef.current = true;
        requestDesktopArticleRecord();
      }
      return;
    }

    if (message.type === 'article:get:result') {
      await applyDesktopArticleRecord(message.article, { backfillLocalChanges: true });
      return;
    }

    if (message.type === 'article:updated') {
      await applyDesktopArticleRecord(message.article);
      return;
    }

    if (message.type === 'article:deleted') {
      await applyDeletedArticleRecord(message.article);
      return;
    }

    if (message.type === 'agent:message:result') {
      appendComment(message.annotationId, message.comment);
      return;
    }

    if (message.type === 'agent:annotate:result') {
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      pendingAgentRequestsRef.current.delete(message.requestId);
      removePendingAgentAnnotation(pending?.pendingAnnotationId);
      if (pending?.agentId) {
        markAgentAnnotating(pending.agentId, false);
        markVirtualReadingDone(pending.agentId);
      }
      setAgentAnnotateOpen(false);
      const constrainedAnnotations = message.annotations.flatMap((annotation) => {
        const constrained = constrainAgentPlanAnnotation(annotation, pending?.readingPlan);
        return constrained ? [constrained] : [];
      });
      if (pending) pending.annotationCount = constrainedAnnotations.length;
      for (const annotation of constrainedAnnotations) enqueueAgentAnnotation(annotation);
      if (pending?.agentId && constrainedAnnotations.length === 0) {
        finishVirtualReading(pending.agentId, '没有批注');
      } else {
        void processAgentAnnotationQueue();
      }
      return;
    }

    if (message.type === 'agent:annotate:start') {
      setAgentAnnotateOpen(false);
      markAgentAnnotating(message.agent.id, true);
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      startVirtualReading(message.agent, pending?.readingPlan || []);
      return;
    }

    if (message.type === 'agent:annotate:item') {
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      const annotation = constrainAgentPlanAnnotation(message.annotation, pending?.readingPlan);
      if (!annotation) {
        readerLog('agent.annotate.item.skip_outside_plan', {
          requestId: message.requestId,
          annotationId: message.annotation.id,
        });
        return;
      }
      if (pending) pending.annotationCount = (pending.annotationCount || 0) + 1;
      readerLog('agent.annotate.item', {
        annotationId: annotation.id,
        exact: annotation.anchor.exact.slice(0, 80),
      });
      enqueueAgentAnnotation(annotation);
      void processAgentAnnotationQueue();
      return;
    }

    if (message.type === 'agent:annotate:done') {
      readerLog('agent.annotate.done', { requestId: message.requestId });
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      pendingAgentRequestsRef.current.delete(message.requestId);
      removePendingAgentAnnotation(pending?.pendingAnnotationId);
      if (pending?.agentId) {
        markAgentAnnotating(pending.agentId, false);
        markVirtualReadingDone(pending.agentId);
      }
      setAgentAnnotateOpen(false);
      if (pending?.agentId && !pending.annotationCount) {
        readerLog('agent.annotate.empty', {
          requestId: message.requestId,
          agentId: pending.agentId,
        });
        finishVirtualReading(pending.agentId, '没有批注');
      } else {
        finishVirtualReadingIfIdle(pending?.agentId);
      }
      return;
    }

    if (message.type === 'agent:message:start') {
      pendingAgentRequestsRef.current.set(message.requestId, {
        annotationId: message.annotationId,
        commentId: message.comment.id,
      });
      appendComment(message.annotationId, message.comment, { commit: false });
      return;
    }

    if (message.type === 'agent:message:delta') {
      updateAgentCommentDelta(message.annotationId, message.commentId, message.delta);
      return;
    }

    if (message.type === 'agent:message:done') {
      pendingAgentRequestsRef.current.delete(message.requestId);
      await updateComment(message.annotationId, message.commentId, (comment) => ({
        ...comment,
        pending: false,
      }));
      return;
    }

    if (message.type === 'error' && message.requestId) {
      readerLog('ws.error.message', { requestId: message.requestId, message: message.message });
      setAgentAnnotateOpen(false);
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      if (!pending) return;

      pendingAgentRequestsRef.current.delete(message.requestId);
      removePendingAgentAnnotation(pending.pendingAnnotationId);
      if (pending.agentId) {
        markAgentAnnotating(pending.agentId, false);
        finishVirtualReading(pending.agentId, '批注失败');
      }
      if (!pending.annotationId) return;

      await updateComment(pending.annotationId, pending.commentId, (comment) => ({
        ...comment,
        content: comment.content || `Agent 回复失败：${message.message}`,
        pending: false,
      }));
    }
  }

  function appendComment(
    annotationId: string,
    comment: Comment,
    options: { commit?: boolean } = {},
  ) {
    const nextAnnotations = appendAnnotationComment(annotationsRef.current, annotationId, comment);
    if (!nextAnnotations) return;

    if (options.commit === false) applyAnnotations(nextAnnotations);
    else saveAnnotations(nextAnnotations);
    setActiveId(annotationId);
  }

  function updateAgentCommentDelta(annotationId: string, commentId: string, delta: string) {
    const nextAnnotations = applyAgentCommentDelta(
      annotationsRef.current,
      annotationId,
      commentId,
      delta,
    );
    if (!nextAnnotations) return;

    applyAnnotations(nextAnnotations);
    setActiveId(annotationId);
  }

  async function updateComment(
    annotationId: string,
    commentId: string,
    update: (comment: Comment) => Comment,
  ) {
    const nextAnnotations = updateAnnotationComment(
      annotationsRef.current,
      annotationId,
      commentId,
      update,
    );
    if (!nextAnnotations) return;

    await saveAnnotations(nextAnnotations);
    setActiveId(annotationId);
  }

  function handleMouseUp(event: React.MouseEvent<HTMLElement>) {
    const article = articleRef.current;
    const target = event.target;
    if (!article || !(target instanceof Node) || !article.contains(target)) return;

    requestAnimationFrame(readSelection);
  }

  function readSelection() {
    const article = articleRef.current;
    const canvas = canvasRef.current;
    if (!article || !canvas) return;

    const selection = getArticleSelection(article);
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSelectionAction(null);
      setTemporaryBoxes([]);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!isRangeInsideArticle(range, article)) {
      setSelectionAction(null);
      setTemporaryBoxes([]);
      return;
    }

    const exact = range.toString().trim();
    if (exact.length === 0) {
      setSelectionAction(null);
      setTemporaryBoxes([]);
      return;
    }

    const articleText = article.textContent || '';
    const start = offsetFromArticleStart(article, range.startContainer, range.startOffset);
    const end = offsetFromArticleStart(article, range.endContainer, range.endOffset);
    const anchor = createTextAnchor(articleText, start, end);
    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    if (!lastRect) {
      setSelectionAction(null);
      setTemporaryBoxes([]);
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const position = selectionActionPosition(lastRect, canvasRect);

    setSelectionAction({
      x: position.x,
      y: position.y,
      anchor,
    });
    setTemporaryBoxes(
      rangeHighlightBoxes(range, canvasRect, 'selection').map((box) =>
        Object.assign({}, box, {
          annotationId: '__selection__',
          color: userProfile.annotationColor,
        }),
      ),
    );
    selection.removeAllRanges();
  }

  async function createAnnotation(
    note: string,
    annotationType: AnnotationType,
    readingIntent: AgentReadingIntent,
  ) {
    if (!composer) return;

    const mentionedAgents = findMentionedAgents(note, agents);
    if (mentionedAgents.length > 0) {
      const instruction = agentInstructionFromNote(note, mentionedAgents);
      const pendingAnnotations: PendingAgentAnnotation[] = [];

      for (const agent of mentionedAgents) {
        const pendingAnnotationId = makeId('pending_annotation');
        const started = requestAgentAnnotations(
          agent,
          readingIntent,
          composer.anchor,
          annotationType,
          instruction,
          pendingAnnotationId,
        );
        if (started) {
          pendingAnnotations.push({
            id: pendingAnnotationId,
            agents: [agent],
            annotationType,
            readingIntent,
          });
        }
      }

      if (pendingAnnotations.length === 0) return;
      setPendingAgentAnnotations((items) => [...items, ...pendingAnnotations]);
      closeComposerSelection();
      return;
    }

    const annotation = createUserAnnotation(composer.anchor, userProfile, note, annotationType);

    await saveAnnotations([...annotationsRef.current, annotation]);
    setActiveId(annotation.id);
    closeComposerSelection();
  }

  function closeComposerSelection() {
    setComposer(null);
    setSelectionAction(null);
    setTemporaryBoxes([]);
    getArticleSelection(articleRef.current!)?.removeAllRanges();
  }

  function cancelComposer() {
    setComposer(null);
    setSelectionAction(null);
    setTemporaryBoxes([]);
  }

  async function deleteAnnotation(annotationId: string) {
    const nextAnnotations = annotationsRef.current.filter(
      (annotation) => annotation.id !== annotationId,
    );
    noteRefs.current.delete(annotationId);
    for (const [requestId, pending] of pendingAgentRequestsRef.current) {
      if (pending.annotationId === annotationId) pendingAgentRequestsRef.current.delete(requestId);
    }
    await saveAnnotations(nextAnnotations);
    if (activeId === annotationId) setActiveId(null);
  }

  async function addComment(annotationId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userComment = createUserComment(userProfile, trimmed);
    const isFollowUpQuestion = /[?？]/.test(trimmed);
    const comment = isFollowUpQuestion
      ? Object.assign({}, userComment, { questionStatus: 'open' as const })
      : userComment;
    const currentAnnotations = isFollowUpQuestion
      ? annotationsRef.current
      : annotationsRef.current.map((annotation) =>
          annotation.id !== annotationId
            ? annotation
            : Object.assign({}, annotation, {
                questionStatus:
                  annotation.questionStatus === 'open' ||
                  (annotation.annotationType === 'question' && !annotation.questionStatus)
                    ? 'answered'
                    : annotation.questionStatus,
                comments: annotation.comments.map((item) =>
                  item.questionStatus === 'open' ||
                  (!item.questionStatus && /[?？]/.test(item.content))
                    ? Object.assign({}, item, { questionStatus: 'answered' as const })
                    : item,
                ),
              }),
        );
    const nextAnnotations = appendAnnotationComment(
      currentAnnotations,
      annotationId,
      comment,
      userComment.createdAt,
    );
    const nextAnnotation = nextAnnotations?.find((annotation) => annotation.id === annotationId);
    if (!nextAnnotations || !nextAnnotation) return;

    await saveAnnotations(nextAnnotations);
    setActiveId(annotationId);

    const mentionedAgents = findMentionedAgents(trimmed, agents);
    for (const agent of mentionedAgents) {
      sendAgentMessage(agent, nextAnnotation, comment);
    }
  }

  async function setAnnotationQuestionStatus(annotationId: string, status: QuestionStatus) {
    const now = new Date().toISOString();
    const nextAnnotations = annotationsRef.current.map((annotation) =>
      annotation.id === annotationId
        ? Object.assign({}, annotation, {
            questionStatus: status,
            updatedAt: now,
          })
        : annotation,
    );
    await saveAnnotations(nextAnnotations);
    setActiveId(annotationId);
  }

  async function setCommentQuestionStatus(
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) {
    const now = new Date().toISOString();
    const nextAnnotations = annotationsRef.current.map((annotation) =>
      annotation.id === annotationId
        ? Object.assign({}, annotation, {
            updatedAt: now,
            comments: annotation.comments.map((comment) =>
              comment.id === commentId
                ? Object.assign({}, comment, { questionStatus: status })
                : comment,
            ),
          })
        : annotation,
    );
    await saveAnnotations(nextAnnotations);
    setActiveId(annotationId);
  }

  function sendAgentMessage(agent: PublicAgent, annotation: Annotation, userComment: Comment) {
    sendDesktopMessage({
      type: 'agent:message',
      requestId: makeId('request'),
      payload: {
        agentId: agent.id,
        agentUsername: agent.username,
        readingIntent: annotation.readingIntent || userComment.readingIntent,
        article: {
          title: extracted.title,
          url: extracted.canonicalUrl,
          text: articleRef.current?.textContent || '',
        },
        annotation,
        userComment,
      },
    });
  }

  function requestAgentAnnotations(
    agent: PublicAgent,
    readingIntent: AgentReadingIntent,
    targetAnchor?: Annotation['anchor'],
    annotationType?: AnnotationType,
    instruction?: string,
    pendingAnnotationId?: string,
  ) {
    return requestAgentAnnotationPayload(agent, {
      annotationType,
      readingIntent,
      instruction,
      targetAnchor,
      pendingAnnotationId,
    });
  }

  function requestAgentReadingPlan(agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) {
    requestAgentAnnotationPayload(agent, { readingPlan });
  }

  function requestAgentAnnotationPayload(
    agent: PublicAgent,
    options: {
      annotationType?: AnnotationType;
      readingIntent?: AgentReadingIntent;
      instruction?: string;
      targetAnchor?: Annotation['anchor'];
      pendingAnnotationId?: string;
      readingPlan?: AgentReadingPlanItem[];
    },
  ) {
    if (annotatingAgents.includes(agent.id)) return false;
    if (!desktopAuthenticatedRef.current) return false;
    const bridge = desktopBridgeRef.current;
    if (!bridge || bridge.readyState !== WebSocket.OPEN) return false;

    const requestId = makeId('request');
    pendingAgentRequestsRef.current.set(requestId, {
      annotationId: '',
      commentId: '',
      agentId: agent.id,
      annotationCount: 0,
      pendingAnnotationId: options.pendingAnnotationId,
      readingPlan: options.readingPlan,
    });
    markAgentAnnotating(agent.id, true);
    bridge.send({
      type: 'agent:annotate',
      requestId,
      payload: {
        agentId: agent.id,
        agentUsername: agent.username,
        annotationType: options.annotationType,
        readingIntent: options.readingIntent,
        instruction: options.instruction,
        targetAnchor: options.targetAnchor,
        readingPlan: options.readingPlan,
        article: {
          title: extracted.title,
          url: extracted.canonicalUrl,
          text: articleRef.current?.textContent || '',
        },
      },
    });
    return true;
  }

  function constrainAgentPlanAnnotation(
    annotation: Annotation,
    readingPlan: AgentReadingPlanItem[] | undefined,
  ) {
    if (!readingPlan?.length) return annotation;

    const articleText = articleRef.current?.textContent || '';
    const position = resolveTextAnchor(articleText, annotation.anchor);
    if (!position) return null;

    const planItem = readingPlan.find(
      (item) => position.start >= item.sectionStart && position.end <= item.sectionEnd,
    );
    if (!planItem) return null;

    if (annotation.readingIntent === planItem.readingIntent) return annotation;
    return {
      ...annotation,
      readingIntent: planItem.readingIntent,
      comments: annotation.comments.map((comment) => ({
        ...comment,
        readingIntent: comment.readingIntent || planItem.readingIntent,
      })),
    };
  }

  async function savePairingToken() {
    const token = pairingTokenDraft.trim();
    if (!token) {
      await disconnectDesktop();
      return;
    }

    await writeExtensionStorage({ [DESKTOP_PAIRING_TOKEN_KEY]: token });
    setPairingToken(token);
    setPairingStatus('正在连接');
  }

  async function disconnectDesktop() {
    await removeExtensionStorage([DESKTOP_PAIRING_TOKEN_KEY, DESKTOP_PAIRING_ID_KEY]);
    setPairingToken('');
    setPairingTokenDraft('');
    setPairingId('');
    setPairingStatus('未配对');
    setDesktopConnected(false);
    setAgents([]);
    desktopAuthenticatedRef.current = false;
    desktopInitialSyncRef.current = false;
    desktopBridgeRef.current?.close();
    desktopBridgeRef.current = null;
  }

  function hasPendingAgentComment() {
    for (const pending of pendingAgentRequestsRef.current.values()) {
      if (pending.annotationId && pending.commentId) return true;
    }
    return false;
  }

  function clearPendingAgentRequests(reason: string) {
    const pendingRequests = Array.from(pendingAgentRequestsRef.current.values());
    if (pendingRequests.length === 0) return;

    pendingAgentRequestsRef.current.clear();
    setAgentAnnotateOpen(false);
    for (const pending of pendingRequests) {
      if (pending.agentId) {
        markAgentAnnotating(pending.agentId, false);
        finishVirtualReading(pending.agentId, reason);
      }
      removePendingAgentAnnotation(pending.pendingAnnotationId);
      if (pending.annotationId && pending.commentId) {
        void updateComment(pending.annotationId, pending.commentId, (comment) => ({
          ...comment,
          content: comment.content || `Agent 回复中断：${reason}`,
          pending: false,
        }));
      }
    }
  }

  function removePendingAgentAnnotation(pendingAnnotationId: string | undefined) {
    if (!pendingAnnotationId) return;
    setPendingAgentAnnotations((items) => items.filter((item) => item.id !== pendingAnnotationId));
  }

  function agentInstructionFromNote(note: string, mentionedAgents: PublicAgent[]) {
    let instruction = note.trim();
    for (const agent of mentionedAgents) {
      instruction = instruction.replace(
        new RegExp(`(^|\\s)@${escapeRegExp(agent.username)}(?=\\s|$)`, 'g'),
        ' ',
      );
    }
    return instruction.replace(/\s+/g, ' ').trim();
  }

  function cancelAgentAnnotateMenu() {
    setAgentAnnotateOpen(false);
  }

  function focusAnnotation(annotationId: string) {
    setHighlightChoice(null);
    setActiveId(annotationId);
    noteRefs.current.get(annotationId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleHighlightClick(annotationId: string, event: React.MouseEvent<HTMLButtonElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      focusAnnotation(annotationId);
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const annotationIds = annotationIdsAtHighlightPoint(
      boxes,
      {
        x: event.clientX - canvasRect.left,
        y: event.clientY - canvasRect.top,
      },
      1,
    );

    if (annotationIds.length <= 1) {
      focusAnnotation(annotationIds[0] || annotationId);
      return;
    }

    setSelectionAction(null);
    const x = event.clientX - canvasRect.left + 8;
    setHighlightChoice({
      x: Math.max(8, Math.min(Math.max(8, canvasRect.width - 240), x)),
      y: Math.max(8, event.clientY - canvasRect.top + 8),
      annotationIds,
    });
  }

  function scrollToHighlight(annotationId: string) {
    setHighlightChoice(null);
    setNotesOpen(false);
    setActiveId(annotationId);
    const annotation = annotations.find((item) => item.id === annotationId);
    const article = articleRef.current;
    if (!annotation || !article) return;

    const position = resolveTextAnchor(article.textContent || '', annotation.anchor);
    if (!position) return;

    const range = rangeFromOffsets(article, position.start, position.end);
    const firstRect = range?.getClientRects()[0];
    const surface = surfaceRef.current;
    if (firstRect && surface) scrollReaderSurfaceToRect(surface, firstRect, 96);
  }

  function scrollToHeading(item: TocItem) {
    setTocOpen(false);
    const article = articleRef.current;
    const surface = surfaceRef.current;
    if (!article || !surface) return;

    const heading = findCurrentTocTarget(article, item);
    if (!heading) return;

    scrollReaderSurfaceToElement(surface, heading, 32);
  }

  return (
    <ReaderAppView
      activeConnection={activeConnection}
      activeId={activeId}
      agentAnnotateOpen={agentAnnotateOpen}
      agentTheaterBoxes={agentTheaterBoxes}
      agents={agents}
      annotatingAgents={annotatingAgents}
      annotationTotals={annotationTotals}
      annotations={annotations}
      articleRef={articleRef}
      boxes={boxes}
      canvasRef={canvasRef}
      composer={composer}
      desktopConnected={desktopConnected}
      extracted={extracted}
      filteredAnnotations={filteredAnnotations}
      highlightChoice={highlightChoice}
      notesOpen={notesOpen}
      noteRefs={noteRefs}
      notesRef={notesRef}
      pairingStatus={pairingStatus}
      pendingAgentAnnotations={pendingAgentAnnotations}
      pairingId={pairingId}
      pairingTokenDraft={pairingTokenDraft}
      hasSavedPairing={Boolean(pairingToken.trim())}
      readerSettings={readerSettings}
      readingSections={readingSections}
      selectionAction={selectionAction}
      settingsOpen={settingsOpen}
      shortcutModifier={shortcutModifier}
      surfaceRef={surfaceRef}
      temporaryBoxes={temporaryBoxes}
      tocOpen={tocOpen}
      tocAnnotationStats={tocAnnotationStats}
      tocItems={tocItems}
      userProfile={userProfile}
      virtualCursors={virtualCursors}
      onAddComment={addComment}
      onCancelAgentAnnotateMenu={cancelAgentAnnotateMenu}
      onCancelComposer={cancelComposer}
      onClose={onClose}
      onCreateAnnotation={createAnnotation}
      onDeleteAnnotation={deleteAnnotation}
      onFocusAnnotation={focusAnnotation}
      onHighlightClick={handleHighlightClick}
      onMouseUp={handleMouseUp}
      onCloseHighlightChoice={() => setHighlightChoice(null)}
      onCloseFloatingPanels={() => {
        setSettingsOpen(false);
        setAgentAnnotateOpen(false);
      }}
      onCloseResponsivePanels={() => {
        setTocOpen(false);
        setNotesOpen(false);
      }}
      onOpenComposer={(action) => {
        const canvasWidth = canvasRef.current?.clientWidth || 360;
        setComposer({
          x: Math.min(action.x, Math.max(4, canvasWidth - 364)),
          y: action.y,
          anchor: action.anchor,
        });
        setSelectionAction(null);
      }}
      onStartAgentReadingPlan={requestAgentReadingPlan}
      onSavePairingToken={savePairingToken}
      onScrollToHeading={scrollToHeading}
      onScrollToHighlight={scrollToHighlight}
      onSetAnnotationQuestionStatus={setAnnotationQuestionStatus}
      onSetCommentQuestionStatus={setCommentQuestionStatus}
      onSetPairingTokenDraft={setPairingTokenDraft}
      onToggleNotes={() => setNotesOpen((open) => !open)}
      onToggleToc={() => setTocOpen((open) => !open)}
      onToggleAgentAnnotate={() => {
        setSettingsOpen(false);
        setAgentAnnotateOpen((open) => !open);
      }}
      onToggleSettings={() => {
        setAgentAnnotateOpen(false);
        setSettingsOpen((open) => !open);
      }}
      onDisconnectDesktop={disconnectDesktop}
      onUpdateReaderSettings={updateReaderSettings}
    />
  );
}
