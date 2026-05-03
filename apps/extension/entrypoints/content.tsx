import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Bot, Settings2, X } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Tabs, TabsList, TabsTrigger } from '../src/components/ui/tabs';
import {
  type Annotation,
  type ArticleRecord,
  type Comment,
  type DesktopServerMessage,
  type PublicAgent,
  type TextAnchor,
  type UserProfile,
  createTextAnchor,
  makeId,
  resolveTextAnchor,
} from '@yomitomo/shared';
import {
  annotationColor,
  annotationToPublicAgent as annotationToAgent,
  appendAnnotationComment,
  createUserAnnotation,
  createUserComment,
  findMentionedAgents,
  updateAnnotationComment,
} from '@yomitomo/core';
import {
  type ExtractedArticle,
  extractCurrentArticle,
  fallbackCurrentArticle,
} from '../src/article-extraction';
import {
  type HighlightBox,
  type TocItem,
  cursorPositionFromOffset,
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
import {
  AgentAnnotateMenu,
  AnnotationCard,
  AnnotationConnection,
  Composer,
  EmptyNotes,
  ReaderSettingsPanel,
  SelectionMenu,
  VirtualCursor,
  type ActiveConnection,
  type ReaderSettings,
  type VirtualCursorState,
} from '../src/reader-components';
import { readerConversationStyles, readerStyles } from '../src/reader-styles';
import {
  agentQueueKey,
  animateTheaterHighlight,
  buildTocAnnotationStats,
  clampNumber,
  defaultReaderSettings,
  defaultUserProfile,
  getShortcutModifier,
  highlightStyle,
  isNewerArticleRecord,
  isPrimaryTocItem,
  normalizeUserProfile,
  sleep,
  toCachedArticleRecord,
} from '../src/reader-utils';

const HOST_ID = 'yomitomo-root';
const STORAGE_PREFIX = 'yomitomo.article.';
const LEGACY_STORAGE_PREFIX = 'reader.article.';
const READER_SETTINGS_KEY = 'yomitomo.settings';
const LEGACY_READER_SETTINGS_KEY = 'reader.settings';
const DESKTOP_PROFILE_CACHE_KEY = 'yomitomo.desktopProfile';
const LEGACY_DESKTOP_PROFILE_CACHE_KEY = 'reader.desktopProfile';
const DESKTOP_WS_URL = 'ws://127.0.0.1:43891';
type DesktopProfileCache = {
  user: UserProfile;
  agents: PublicAgent[];
};
let root: Root | null = null;
let previousOverflow = '';

function readerLog(event: string, data?: Record<string, unknown>) {
  console.log('[Yomitomo Extension]', event, data || '');
}

type RuntimeMessage = { type?: string };
type RuntimeResponse = { ok: true } | { ok: false; error: string };

type SelectionAction = {
  x: number;
  y: number;
  anchor: TextAnchor;
};

type PendingComposer = SelectionAction;

type NoteFilter = 'all' | 'ai' | 'user';

type VirtualReadingSession = {
  agent: PublicAgent;
  timerId: number;
  offset: number;
  paused: boolean;
  done: boolean;
  step: number;
};

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      if (message.type !== 'yomitomo:toggle' && message.type !== 'yomitomo:toggle:v2') return;

      return toggleReader()
        .then(() => ({ ok: true }) satisfies RuntimeResponse)
        .catch((error: unknown) => {
          console.error('[Yomitomo Extension] toggle failed', error);
          return { ok: false, error: errorMessage(error) } satisfies RuntimeResponse;
        });
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

function closeReader(host: HTMLElement) {
  root?.unmount();
  root = null;
  host.remove();
  document.documentElement.style.overflow = previousOverflow;
}

function ReaderApp({ extracted, onClose }: { extracted: ExtractedArticle; onClose: () => void }) {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const articleRecordRef = useRef<ArticleRecord | null>(null);
  const recordCreatedAtRef = useRef<string | null>(null);
  const pendingAgentRequestsRef = useRef(
    new Map<string, { annotationId: string; commentId: string; agentId?: string }>(),
  );
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const agentAnnotationQueuesRef = useRef(new Map<string, Annotation[]>());
  const agentQueueOrderRef = useRef<string[]>([]);
  const lastPlayedAgentRef = useRef<string | null>(null);
  const agentAnimationRunningRef = useRef(false);
  const virtualReadingSessionsRef = useRef(new Map<string, VirtualReadingSession>());
  const virtualCursorRef = useRef(new Map<string, VirtualCursorState>());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [desktopConnected, setDesktopConnected] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(defaultUserProfile);
  const [agents, setAgents] = useState<PublicAgent[]>([]);
  const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(null);
  const [composer, setComposer] = useState<PendingComposer | null>(null);
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [annotatingAgents, setAnnotatingAgents] = useState<string[]>([]);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);
  const [readerSettings, setReaderSettings] = useState(defaultReaderSettings);
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);

  const storageKey = `${STORAGE_PREFIX}${extracted.id}`;
  const legacyStorageKey = `${LEGACY_STORAGE_PREFIX}${extracted.id}`;
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
  const filteredAnnotations = useMemo(() => {
    if (noteFilter === 'all') return annotations;
    return annotations.filter((annotation) => annotation.author === noteFilter);
  }, [annotations, noteFilter]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (article) setTocItems(extractTocItems(article));
  }, [extracted.content]);

  useEffect(() => {
    if (!activeId) return;
    if (filteredAnnotations.some((annotation) => annotation.id === activeId)) return;
    setActiveId(filteredAnnotations[0]?.id || null);
  }, [activeId, filteredAnnotations]);

  useEffect(() => {
    browser.storage.local
      .get([
        storageKey,
        legacyStorageKey,
        READER_SETTINGS_KEY,
        LEGACY_READER_SETTINGS_KEY,
        DESKTOP_PROFILE_CACHE_KEY,
        LEGACY_DESKTOP_PROFILE_CACHE_KEY,
      ])
      .then(async (stored) => {
        const loaded = (stored[storageKey] || stored[legacyStorageKey]) as
          | ArticleRecord
          | undefined;
        const migrated: Record<string, unknown> = {};
        const legacyKeys: string[] = [];

        if (!stored[storageKey] && loaded) legacyKeys.push(legacyStorageKey);

        if (loaded) {
          const nextRecord = buildCurrentArticleRecord(
            loaded.annotations || [],
            loaded.createdAt,
            loaded.updatedAt,
          );
          if (applyNewerArticleRecord(nextRecord)) {
            migrated[storageKey] = toCachedArticleRecord(nextRecord);
          }
        }
        const cachedDesktopProfile = (stored[DESKTOP_PROFILE_CACHE_KEY] ||
          stored[LEGACY_DESKTOP_PROFILE_CACHE_KEY]) as DesktopProfileCache | undefined;
        if (!stored[DESKTOP_PROFILE_CACHE_KEY] && cachedDesktopProfile) {
          migrated[DESKTOP_PROFILE_CACHE_KEY] = cachedDesktopProfile;
          legacyKeys.push(LEGACY_DESKTOP_PROFILE_CACHE_KEY);
        }
        if (cachedDesktopProfile) {
          setUserProfile(normalizeUserProfile(cachedDesktopProfile.user));
          setAgents(cachedDesktopProfile.agents || []);
        }
        const savedSettings = (stored[READER_SETTINGS_KEY] ||
          stored[LEGACY_READER_SETTINGS_KEY]) as ReaderSettings | undefined;
        if (!stored[READER_SETTINGS_KEY] && savedSettings) {
          migrated[READER_SETTINGS_KEY] = savedSettings;
          legacyKeys.push(LEGACY_READER_SETTINGS_KEY);
        }
        if (savedSettings) {
          setReaderSettings({
            fontSize: clampNumber(savedSettings.fontSize, 16, 28, defaultReaderSettings.fontSize),
            contentWidth: clampNumber(
              savedSettings.contentWidth,
              680,
              1080,
              defaultReaderSettings.contentWidth,
            ),
          });
        }

        try {
          if (Object.keys(migrated).length > 0) await browser.storage.local.set(migrated);
          if (legacyKeys.length > 0) await browser.storage.local.remove(legacyKeys);
        } catch (error) {
          readerLog('storage.migrate.error', { message: errorMessage(error) });
        }
      });
  }, [legacyStorageKey, storageKey]);

  const saveAnnotations = useCallback(
    (nextAnnotations: Annotation[]) => {
      const now = new Date().toISOString();
      const createdAt = recordCreatedAtRef.current || now;
      const nextRecord = buildCurrentArticleRecord(nextAnnotations, createdAt, now);
      applyArticleRecord(nextRecord);
      sendArticleRecord(nextRecord);
      void cacheArticleRecord(nextRecord);
    },
    [extracted, storageKey],
  );

  function buildCurrentArticleRecord(
    nextAnnotations: Annotation[],
    createdAt: string,
    updatedAt: string,
  ): ArticleRecord {
    return {
      id: extracted.id,
      url: extracted.url,
      canonicalUrl: extracted.canonicalUrl,
      title: extracted.title,
      byline: extracted.byline,
      excerpt: extracted.excerpt,
      contentHtml: extracted.content,
      contentHash: extracted.contentHash,
      annotations: nextAnnotations,
      createdAt,
      updatedAt,
    };
  }

  function applyArticleRecord(record: ArticleRecord) {
    recordCreatedAtRef.current = record.createdAt;
    annotationsRef.current = record.annotations || [];
    articleRecordRef.current = record;
    setAnnotations(record.annotations || []);
  }

  function applyNewerArticleRecord(record: ArticleRecord) {
    const current = articleRecordRef.current;
    if (!isNewerArticleRecord(record, current)) return false;

    applyArticleRecord(record);
    return true;
  }

  async function cacheArticleRecord(record: ArticleRecord) {
    try {
      await browser.storage.local.set({ [storageKey]: toCachedArticleRecord(record) });
    } catch (error) {
      readerLog('storage.cache.error', { message: errorMessage(error) });
    }
  }

  function sendArticleRecord(record: ArticleRecord) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({ type: 'article:save', requestId: makeId('request'), payload: record }),
    );
  }

  function sendCurrentArticleRecord() {
    const current = articleRecordRef.current;
    if (!current) return;
    const nextRecord = buildCurrentArticleRecord(
      current.annotations || [],
      current.createdAt,
      current.updatedAt,
    );
    applyArticleRecord(nextRecord);
    sendArticleRecord(nextRecord);
  }

  function requestDesktopArticleRecord() {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: 'article:get',
        requestId: makeId('request'),
        payload: {
          id: extracted.id,
          url: extracted.url,
          canonicalUrl: extracted.canonicalUrl,
        },
      }),
    );
  }

  async function applyDesktopArticleRecord(record: ArticleRecord | null) {
    if (!record) {
      sendCurrentArticleRecord();
      return;
    }

    const current = articleRecordRef.current;
    if (!isNewerArticleRecord(record, current)) {
      sendCurrentArticleRecord();
      return;
    }

    const nextRecord = buildCurrentArticleRecord(
      record.annotations || [],
      record.createdAt,
      record.updatedAt,
    );
    applyArticleRecord(nextRecord);
    sendArticleRecord(nextRecord);
    void cacheArticleRecord(nextRecord);
  }

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
    const notes = notesRef.current;
    const note = noteRefs.current.get(activeId);
    const annotation = annotations.find((item) => item.id === activeId);
    const activeBoxes = boxes.filter((box) => box.annotationId === activeId);
    if (!canvas || !surface || !notes || !note || !annotation || activeBoxes.length === 0) {
      setActiveConnection(null);
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const notesRect = notes.getBoundingClientRect();
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
      noteRect.bottom >= notesRect.top + 24 && noteRect.top <= notesRect.bottom - 24;
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
    let closed = false;
    let reconnectTimer = 0;

    const connect = () => {
      const socket = new WebSocket(DESKTOP_WS_URL);
      wsRef.current = socket;

      socket.addEventListener('open', () => {
        readerLog('ws.open');
        setDesktopConnected(true);
        socket.send(JSON.stringify({ type: 'hello' }));
        socket.send(JSON.stringify({ type: 'agent:list', requestId: makeId('request') }));
        requestDesktopArticleRecord();
      });

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data) as DesktopServerMessage;
        readerLog('ws.message', {
          type: message.type,
          requestId: 'requestId' in message ? message.requestId : undefined,
        });
        void handleDesktopMessage(message);
      });

      socket.addEventListener('close', () => {
        readerLog('ws.close');
        setDesktopConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 2000);
      });

      socket.addEventListener('error', () => {
        readerLog('ws.error');
        setDesktopConnected(false);
      });
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      for (const session of virtualReadingSessionsRef.current.values()) {
        window.clearInterval(session.timerId);
      }
      wsRef.current?.close();
    };
  }, [saveAnnotations]);

  useEffect(() => {
    setSelectedAgentIds((ids) => ids.filter((id) => agents.some((agent) => agent.id === id)));
    setAnnotatingAgents((ids) => ids.filter((id) => agents.some((agent) => agent.id === id)));
  }, [agents]);

  useLayoutEffect(() => {
    recalculateHighlights();
  }, [recalculateHighlights, readerSettings]);

  useLayoutEffect(() => {
    recalculateActiveConnection();
  }, [recalculateActiveConnection]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recalculateHighlights);
    };

    surface.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateHighlights]);

  useEffect(() => {
    const surface = surfaceRef.current;
    const notes = notesRef.current;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recalculateActiveConnection);
    };

    surface?.addEventListener('scroll', schedule, { passive: true });
    notes?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      surface?.removeEventListener('scroll', schedule);
      notes?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateActiveConnection]);

  async function handleDesktopMessage(message: DesktopServerMessage) {
    if (message.type === 'status' || message.type === 'agent:list:result') {
      const user = normalizeUserProfile(message.user);
      setDesktopConnected(message.type === 'status' ? message.ok : true);
      setUserProfile(user);
      setAgents(message.agents);
      await browser.storage.local.set({
        [DESKTOP_PROFILE_CACHE_KEY]: { user, agents: message.agents } satisfies DesktopProfileCache,
      });
      return;
    }

    if (message.type === 'article:get:result') {
      await applyDesktopArticleRecord(message.article);
      return;
    }

    if (message.type === 'agent:message:result') {
      await appendComment(message.annotationId, message.comment);
      return;
    }

    if (message.type === 'agent:annotate:result') {
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      pendingAgentRequestsRef.current.delete(message.requestId);
      if (pending?.agentId) markAgentAnnotating(pending.agentId, false);
      setAgentAnnotateOpen(false);
      for (const annotation of message.annotations) enqueueAgentAnnotation(annotation);
      void processAgentAnnotationQueue();
      return;
    }

    if (message.type === 'agent:annotate:start') {
      setAgentAnnotateOpen(false);
      markAgentAnnotating(message.agent.id, true);
      startVirtualReading(message.agent);
      return;
    }

    if (message.type === 'agent:annotate:item') {
      readerLog('agent.annotate.item', {
        annotationId: message.annotation.id,
        exact: message.annotation.anchor.exact.slice(0, 80),
      });
      enqueueAgentAnnotation(message.annotation);
      void processAgentAnnotationQueue();
      return;
    }

    if (message.type === 'agent:annotate:done') {
      readerLog('agent.annotate.done', { requestId: message.requestId });
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      pendingAgentRequestsRef.current.delete(message.requestId);
      if (pending?.agentId) {
        markAgentAnnotating(pending.agentId, false);
        const session = virtualReadingSessionsRef.current.get(pending.agentId);
        if (session) session.done = true;
      }
      setAgentAnnotateOpen(false);
      finishVirtualReadingIfIdle(pending?.agentId);
      return;
    }

    if (message.type === 'agent:message:start') {
      pendingAgentRequestsRef.current.set(message.requestId, {
        annotationId: message.annotationId,
        commentId: message.comment.id,
      });
      await appendComment(message.annotationId, message.comment);
      return;
    }

    if (message.type === 'agent:message:delta') {
      await updateComment(message.annotationId, message.commentId, (comment) => ({
        ...comment,
        content: comment.content + message.delta,
      }));
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

  async function appendComment(annotationId: string, comment: Comment) {
    const nextAnnotations = appendAnnotationComment(
      annotationsRef.current,
      annotationId,
      comment,
    );
    if (!nextAnnotations) return;

    await saveAnnotations(nextAnnotations);
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

  async function updateReaderSettings(nextSettings: ReaderSettings) {
    setReaderSettings(nextSettings);
    await browser.storage.local.set({ [READER_SETTINGS_KEY]: nextSettings });
  }

  function handleMouseUp() {
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

  async function createAnnotation(note: string) {
    if (!composer) return;

    const annotation = createUserAnnotation(composer.anchor, userProfile, note);

    await saveAnnotations([...annotationsRef.current, annotation]);
    setActiveId(annotation.id);
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

    const current = virtualCursorRef.current.get(agentId);
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

  async function addComment(annotationId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userComment = createUserComment(userProfile, trimmed);
    const nextAnnotations = appendAnnotationComment(
      annotationsRef.current,
      annotationId,
      userComment,
      userComment.createdAt,
    );
    const nextAnnotation = nextAnnotations?.find((annotation) => annotation.id === annotationId);
    if (!nextAnnotations || !nextAnnotation) return;

    await saveAnnotations(nextAnnotations);
    setActiveId(annotationId);

    const mentionedAgents = findMentionedAgents(trimmed, agents);
    for (const agent of mentionedAgents) {
      sendAgentMessage(agent, nextAnnotation, userComment);
    }
  }

  function sendAgentMessage(agent: PublicAgent, annotation: Annotation, userComment: Comment) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    socket.send(
      JSON.stringify({
        type: 'agent:message',
        requestId: makeId('request'),
        payload: {
          agentId: agent.id,
          agentUsername: agent.username,
          article: {
            title: extracted.title,
            url: extracted.canonicalUrl,
            text: articleRef.current?.textContent || '',
          },
          annotation,
          userComment,
        },
      }),
    );
  }

  function requestAgentAnnotations(agent: PublicAgent) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const requestId = makeId('request');
    pendingAgentRequestsRef.current.set(requestId, {
      annotationId: '',
      commentId: '',
      agentId: agent.id,
    });
    markAgentAnnotating(agent.id, true);
    socket.send(
      JSON.stringify({
        type: 'agent:annotate',
        requestId,
        payload: {
          agentId: agent.id,
          agentUsername: agent.username,
          article: {
            title: extracted.title,
            url: extracted.canonicalUrl,
            text: articleRef.current?.textContent || '',
          },
        },
      }),
    );
  }

  function requestSelectedAgentAnnotations() {
    const selectedAgents = agents.filter(
      (agent) => selectedAgentIds.includes(agent.id) && !annotatingAgents.includes(agent.id),
    );
    for (const agent of selectedAgents) requestAgentAnnotations(agent);
    if (selectedAgents.length > 0) setAgentAnnotateOpen(false);
  }

  function toggleSelectedAgent(agentId: string) {
    setSelectedAgentIds((ids) =>
      ids.includes(agentId) ? ids.filter((id) => id !== agentId) : [...ids, agentId],
    );
  }

  function cancelAgentAnnotateMenu() {
    setAgentAnnotateOpen(false);
    setSelectedAgentIds([]);
  }

  function focusAnnotation(annotationId: string) {
    setActiveId(annotationId);
    noteRefs.current.get(annotationId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function scrollToHighlight(annotationId: string) {
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
    const article = articleRef.current;
    const surface = surfaceRef.current;
    if (!article || !surface) return;

    const heading = findCurrentTocTarget(article, item);
    if (!heading) return;

    scrollReaderSurfaceToElement(surface, heading, 32);
  }

  const activeAnnotation = useMemo(
    () => annotations.find((item) => item.id === activeId) || null,
    [activeId, annotations],
  );

  return (
    <div
      className="reader-app"
      style={
        {
          '--reader-font-size': `${readerSettings.fontSize}px`,
          '--reader-content-width': `${readerSettings.contentWidth}px`,
        } as React.CSSProperties
      }
    >
      <header className="reader-toolbar">
        <div>
          <div className="reader-eyebrow">Yomitomo</div>
          <h1>
            <span
              className={
                desktopConnected
                  ? 'reader-connection is-connected'
                  : 'reader-connection is-disconnected'
              }
            />
            {extracted.title}
          </h1>
          <p>{extracted.byline || extracted.canonicalUrl}</p>
        </div>
        <div className="reader-toolbar-actions">
          <button
            className={
              agentAnnotateOpen ? 'reader-agent-annotate is-active' : 'reader-agent-annotate'
            }
            type="button"
            disabled={!desktopConnected || agents.length === 0}
            onClick={() => setAgentAnnotateOpen((open) => !open)}
          >
            <Bot size={14} />
            {annotatingAgents.length > 0 ? '批注中' : '助手批注'}
          </button>
          <button
            className={settingsOpen ? 'reader-icon-button is-active' : 'reader-icon-button'}
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="阅读设置"
          >
            <Settings2 size={18} />
          </button>
          <button className="reader-close" type="button" onClick={onClose} aria-label="关闭阅读器">
            <X size={18} />
          </button>
        </div>
      </header>

      {agentAnnotateOpen ? (
        <div className="reader-agent-annotate-popover">
          <AgentAnnotateMenu
            agents={agents}
            annotatingAgents={annotatingAgents}
            selectedAgentIds={selectedAgentIds}
            onCancel={cancelAgentAnnotateMenu}
            onStart={requestSelectedAgentAnnotations}
            onToggle={toggleSelectedAgent}
          />
        </div>
      ) : null}

      {settingsOpen ? (
        <ReaderSettingsPanel settings={readerSettings} onChange={updateReaderSettings} />
      ) : null}

      <main className="reader-main">
        <aside className={tocItems.length > 0 ? 'reader-toc' : 'reader-toc is-empty'}>
          <div className="reader-toc-title">目录</div>
          {tocItems.map((item) => {
            const stats = isPrimaryTocItem(item) ? tocAnnotationStats.get(item.index) : undefined;
            return (
              <button
                className="reader-toc-item"
                data-depth={Math.min(item.depth, 4)}
                key={`${item.index}-${item.text}`}
                type="button"
                onClick={() => scrollToHeading(item)}
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
          <div className="reader-toc-summary">
            共 {annotationTotals.annotations} 条批注 · {annotationTotals.comments} 条评论
          </div>
        </aside>

        <section className="reader-surface" ref={surfaceRef} onMouseUp={handleMouseUp}>
          <div className="reader-canvas" ref={canvasRef}>
            <article className="reader-article" ref={articleRef}>
              <header className="reader-article-header">
                <h1>{extracted.title}</h1>
                {extracted.byline || extracted.excerpt ? (
                  <p>{[extracted.byline, extracted.excerpt].filter(Boolean).join(' · ')}</p>
                ) : null}
              </header>
              <div
                className="reader-article-body"
                dangerouslySetInnerHTML={{ __html: extracted.content }}
              />
            </article>
            <div className="reader-highlight-layer">
              {boxes.map((box) => (
                <button
                  className={
                    box.annotationId === activeId
                      ? 'reader-highlight is-active'
                      : 'reader-highlight'
                  }
                  key={box.id}
                  style={highlightStyle(box, box.annotationId === activeId)}
                  type="button"
                  onClick={() => focusAnnotation(box.annotationId)}
                />
              ))}
              {temporaryBoxes.map((box) => (
                <div
                  className="reader-highlight is-temporary"
                  key={box.id}
                  style={highlightStyle(box, false)}
                />
              ))}
              {agentTheaterBoxes.map((box) => (
                <div
                  className="reader-highlight is-agent-theater"
                  key={box.id}
                  style={highlightStyle(box, false)}
                />
              ))}
            </div>
            {selectionAction && !composer ? (
              <SelectionMenu
                action={selectionAction}
                onAnnotate={() => {
                  const canvasWidth = canvasRef.current?.clientWidth || 340;
                  setComposer({
                    x: Math.min(selectionAction.x, Math.max(4, canvasWidth - 344)),
                    y: selectionAction.y + 44,
                    anchor: selectionAction.anchor,
                  });
                  setSelectionAction(null);
                }}
              />
            ) : null}
            {composer ? (
              <Composer
                composer={composer}
                shortcutModifier={shortcutModifier}
                onCancel={cancelComposer}
                onSave={createAnnotation}
              />
            ) : null}
          </div>
        </section>

        <aside className="reader-notes" ref={notesRef}>
          <div className="reader-notes-header">
            <div className="reader-notes-title-row">
              <strong>批注</strong>
              <span>
                {filteredAnnotations.length} / {annotations.length}
              </span>
            </div>
            <Tabs
              className="reader-note-tabs"
              value={noteFilter}
              onValueChange={(value) => setNoteFilter(value as NoteFilter)}
            >
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="ai">助手批注</TabsTrigger>
                <TabsTrigger value="user">我的批注</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {annotations.length === 0 ? <EmptyNotes /> : null}
          {annotations.length > 0 && filteredAnnotations.length === 0 ? (
            <div className="reader-empty">
              <strong>没有匹配的批注</strong>
              <p>切换筛选项可以查看其他批注。</p>
            </div>
          ) : null}
          {filteredAnnotations.map((annotation) => (
            <AnnotationCard
              active={annotation.id === activeAnnotation?.id}
              agents={agents}
              annotation={annotation}
              desktopConnected={desktopConnected}
              key={annotation.id}
              noteRef={(element) => {
                if (element) noteRefs.current.set(annotation.id, element);
                else noteRefs.current.delete(annotation.id);
              }}
              shortcutModifier={shortcutModifier}
              userProfile={userProfile}
              onAddComment={addComment}
              onDelete={deleteAnnotation}
              onFocus={scrollToHighlight}
            />
          ))}
        </aside>
      </main>

      {activeConnection ? <AnnotationConnection connection={activeConnection} /> : null}

      {virtualCursors.map((cursor) =>
        cursor.visible ? <VirtualCursor cursor={cursor} key={cursor.id} /> : null,
      )}
    </div>
  );
}
