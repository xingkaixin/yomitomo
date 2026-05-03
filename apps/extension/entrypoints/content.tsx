import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { Bot, CaseSensitive, Maximize2, MessageSquarePlus, Minus, Plus, Settings2, Trash2, X } from "lucide-react";
import { browser } from "wxt/browser";
import { Kbd } from "../src/components/ui/kbd";
import {
  type Annotation,
  type ArticleRecord,
  type Comment,
  type DesktopServerMessage,
  type PublicAgent,
  type TextAnchor,
  type UserProfile,
  createTextAnchor,
  hashText,
  makeId,
  resolveTextAnchor
} from "@reader/shared";

const HOST_ID = "reader-agent-root";
const STORAGE_PREFIX = "reader.article.";
const READER_SETTINGS_KEY = "reader.settings";
const DESKTOP_WS_URL = "ws://127.0.0.1:43891";
const defaultUserProfile: UserProfile = {
  nickname: "我",
  username: "me",
  avatar: "",
  annotationColor: "#f4c95d",
  updatedAt: ""
};
let root: Root | null = null;
let previousOverflow = "";

function readerLog(event: string, data?: Record<string, unknown>) {
  console.log("[Reader Agent Extension]", event, data || "");
}

type RuntimeMessage = { type?: string };

type ExtractedArticle = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  byline?: string;
  excerpt?: string;
  content: string;
  contentHash: string;
};

type SelectionAction = {
  x: number;
  y: number;
  anchor: TextAnchor;
};

type PendingComposer = SelectionAction;

type HighlightBox = {
  id: string;
  annotationId: string;
  color: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

type TocItem = {
  id: string;
  text: string;
  depth: number;
};

type ReaderSettings = {
  fontSize: number;
  contentWidth: number;
};

type VirtualCursorState = {
  visible: boolean;
  leaving?: boolean;
  x: number;
  y: number;
  label: string;
  offscreen: "above" | "below" | null;
  agent?: PublicAgent;
};

const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  contentWidth: 860
};

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      if (message.type === "reader:toggle") {
        void toggleReader();
      }
    });
  }
});

async function toggleReader() {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    closeReader(existing);
    return;
  }

  const article = await extractCurrentArticle();
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.append(host);

  previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${readerStyles}\n${readerConversationStyles}`;
  const mount = document.createElement("div");
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

async function extractCurrentArticle(): Promise<ExtractedArticle> {
  const canonicalUrl = getCanonicalUrl();
  const wechatContent = location.hostname === "mp.weixin.qq.com" ? document.getElementById("js_content") : null;

  if (wechatContent) {
    const defuddleArticle = await extractWithDefuddle(canonicalUrl);
    if (defuddleArticle) return defuddleArticle;

    const title = document.querySelector("h1")?.textContent?.trim() || document.title || "Untitled";
    const content = sanitizeArticleHtml(wechatContent.innerHTML);
    const contentHash = hashText(textFromHtml(content).slice(0, 8000));
    return { id: hashText(canonicalUrl || contentHash), url: location.href, canonicalUrl, title, content, contentHash };
  }

  const cloned = document.cloneNode(true) as Document;
  const parsed = new Readability(cloned).parse();
  const fallbackTitle = document.querySelector("h1")?.textContent?.trim() || document.title || "Untitled";
  const rawContent = parsed?.content || document.querySelector("article")?.innerHTML || document.body.innerHTML;
  const content = sanitizeArticleHtml(rawContent);
  const contentHash = hashText(textFromHtml(content).slice(0, 8000));

  return {
    id: hashText(canonicalUrl || contentHash),
    url: location.href,
    canonicalUrl,
    title: parsed?.title || fallbackTitle,
    byline: parsed?.byline || undefined,
    excerpt: parsed?.excerpt || undefined,
    content,
    contentHash
  };
}

async function extractWithDefuddle(canonicalUrl: string): Promise<ExtractedArticle | null> {
  try {
    const { default: Defuddle } = (await import("defuddle")) as { default: any };
    const cloned = document.cloneNode(true) as Document;
    const result = await new Defuddle(cloned, { url: location.href }).parseAsync();
    if (!result?.content) return null;

    const content = sanitizeArticleHtml(result.content);
    const contentHash = hashText(textFromHtml(content).slice(0, 8000));
    return {
      id: hashText(canonicalUrl || contentHash),
      url: location.href,
      canonicalUrl,
      title: result.title || document.querySelector("h1")?.textContent?.trim() || document.title || "Untitled",
      byline: result.author || result.site || undefined,
      excerpt: result.description || undefined,
      content,
      contentHash
    };
  } catch {
    return null;
  }
}

function getCanonicalUrl() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  return link?.href || location.href.split("#")[0];
}

function sanitizeArticleHtml(html: string) {
  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ["math", "mrow", "mi", "mo", "mn", "msup", "msub", "msqrt", "semantics", "annotation"],
    ADD_ATTR: ["display", "xmlns", "encoding"]
  });
  return normalizeReaderHtml(sanitized);
}

function normalizeReaderHtml(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("script, style, link").forEach((element) => element.remove());
  container.querySelectorAll<HTMLElement>("*").forEach((element) => {
    element.removeAttribute("style");
    element.removeAttribute("width");
    element.removeAttribute("height");
    if (element.tagName.includes("-")) {
      element.replaceWith(...Array.from(element.childNodes));
    }
  });
  return container.innerHTML;
}

function textFromHtml(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.textContent || "";
}

function ReaderApp({ extracted, onClose }: { extracted: ExtractedArticle; onClose: () => void }) {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const pendingAgentRequestsRef = useRef(new Map<string, { annotationId: string; commentId: string }>());
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const agentAnnotationQueueRef = useRef<Annotation[]>([]);
  const agentAnimationRunningRef = useRef(false);
  const virtualReadingTimerRef = useRef<number | null>(null);
  const virtualReadingOffsetRef = useRef(0);
  const virtualReadingAgentRef = useRef<PublicAgent | null>(null);
  const virtualReadingPausedRef = useRef(false);
  const virtualReadingDoneRef = useRef(false);
  const virtualCursorRef = useRef<VirtualCursorState | null>(null);
  const [record, setRecord] = useState<ArticleRecord | null>(null);
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
  const [annotatingAgent, setAnnotatingAgent] = useState<string | null>(null);
  const [virtualCursor, setVirtualCursor] = useState<VirtualCursorState | null>(null);
  const [readerSettings, setReaderSettings] = useState(defaultReaderSettings);

  const storageKey = `${STORAGE_PREFIX}${extracted.id}`;
  const shortcutModifier = getShortcutModifier();

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    virtualCursorRef.current = virtualCursor;
  }, [virtualCursor]);

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (article) setTocItems(extractTocItems(article));
  }, [extracted.content]);

  useEffect(() => {
    browser.storage.local.get([storageKey, READER_SETTINGS_KEY]).then((stored) => {
      const loaded = stored[storageKey] as ArticleRecord | undefined;
      if (loaded) {
        setRecord(loaded);
        setAnnotations(loaded.annotations || []);
      }
      const savedSettings = stored[READER_SETTINGS_KEY] as ReaderSettings | undefined;
      if (savedSettings) {
        setReaderSettings({
          fontSize: clampNumber(savedSettings.fontSize, 16, 28, defaultReaderSettings.fontSize),
          contentWidth: clampNumber(savedSettings.contentWidth, 680, 1080, defaultReaderSettings.contentWidth)
        });
      }
    });
  }, [storageKey]);

  const saveAnnotations = useCallback(
    async (nextAnnotations: Annotation[]) => {
      const now = new Date().toISOString();
      const nextRecord: ArticleRecord = {
        id: extracted.id,
        url: extracted.url,
        canonicalUrl: extracted.canonicalUrl,
        title: extracted.title,
        byline: extracted.byline,
        excerpt: extracted.excerpt,
        contentHash: extracted.contentHash,
        annotations: nextAnnotations,
        createdAt: record?.createdAt || now,
        updatedAt: now
      };
      annotationsRef.current = nextAnnotations;
      setAnnotations(nextAnnotations);
      setRecord(nextRecord);
      await browser.storage.local.set({ [storageKey]: nextRecord });
    },
    [extracted, record?.createdAt, storageKey]
  );

  const recalculateHighlights = useCallback(() => {
    const article = articleRef.current;
    const canvas = canvasRef.current;
    if (!article || !canvas) return;

    const articleText = article.textContent || "";
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
          color: annotation.color
        });
      });
    }

    setBoxes(nextBoxes);
  }, [annotations]);

  useEffect(() => {
    let closed = false;
    let reconnectTimer = 0;

    const connect = () => {
      const socket = new WebSocket(DESKTOP_WS_URL);
      wsRef.current = socket;

      socket.addEventListener("open", () => {
        readerLog("ws.open");
        setDesktopConnected(true);
        socket.send(JSON.stringify({ type: "hello" }));
        socket.send(JSON.stringify({ type: "agent:list", requestId: makeId("request") }));
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as DesktopServerMessage;
        readerLog("ws.message", { type: message.type, requestId: "requestId" in message ? message.requestId : undefined });
        void handleDesktopMessage(message);
      });

      socket.addEventListener("close", () => {
        readerLog("ws.close");
        setDesktopConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 2000);
      });

      socket.addEventListener("error", () => {
        readerLog("ws.error");
        setDesktopConnected(false);
      });
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      if (virtualReadingTimerRef.current !== null) window.clearInterval(virtualReadingTimerRef.current);
      wsRef.current?.close();
    };
  }, [saveAnnotations]);

  useLayoutEffect(() => {
    recalculateHighlights();
  }, [recalculateHighlights, readerSettings]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recalculateHighlights);
    };

    surface.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [recalculateHighlights]);

  async function handleDesktopMessage(message: DesktopServerMessage) {
    if (message.type === "status" || message.type === "agent:list:result") {
      setDesktopConnected(message.type === "status" ? message.ok : true);
      setUserProfile(message.user);
      setAgents(message.agents);
      return;
    }

    if (message.type === "agent:message:result") {
      await appendComment(message.annotationId, message.comment);
      return;
    }

    if (message.type === "agent:annotate:result") {
      pendingAgentRequestsRef.current.delete(message.requestId);
      setAnnotatingAgent(null);
      setAgentAnnotateOpen(false);
      for (const annotation of message.annotations) enqueueAgentAnnotation(annotation);
      void processAgentAnnotationQueue();
      return;
    }

    if (message.type === "agent:annotate:start") {
      setAgentAnnotateOpen(false);
      startVirtualReading(message.agent);
      return;
    }

    if (message.type === "agent:annotate:item") {
      readerLog("agent.annotate.item", { annotationId: message.annotation.id, exact: message.annotation.anchor.exact.slice(0, 80) });
      enqueueAgentAnnotation(message.annotation);
      void processAgentAnnotationQueue();
      return;
    }

    if (message.type === "agent:annotate:done") {
      readerLog("agent.annotate.done", { requestId: message.requestId });
      pendingAgentRequestsRef.current.delete(message.requestId);
      setAnnotatingAgent(null);
      setAgentAnnotateOpen(false);
      virtualReadingDoneRef.current = true;
      finishVirtualReadingIfIdle();
      return;
    }

    if (message.type === "agent:message:start") {
      pendingAgentRequestsRef.current.set(message.requestId, { annotationId: message.annotationId, commentId: message.comment.id });
      await appendComment(message.annotationId, message.comment);
      return;
    }

    if (message.type === "agent:message:delta") {
      await updateComment(message.annotationId, message.commentId, (comment) => ({ ...comment, content: comment.content + message.delta }));
      return;
    }

    if (message.type === "agent:message:done") {
      pendingAgentRequestsRef.current.delete(message.requestId);
      await updateComment(message.annotationId, message.commentId, (comment) => ({ ...comment, pending: false }));
      return;
    }

    if (message.type === "error" && message.requestId) {
      readerLog("ws.error.message", { requestId: message.requestId, message: message.message });
      setAnnotatingAgent(null);
      setAgentAnnotateOpen(false);
      const pending = pendingAgentRequestsRef.current.get(message.requestId);
      if (!pending) return;

      pendingAgentRequestsRef.current.delete(message.requestId);
      if (!pending.annotationId) return;

      await updateComment(pending.annotationId, pending.commentId, (comment) => ({
        ...comment,
        content: comment.content || `Agent 回复失败：${message.message}`,
        pending: false
      }));
    }
  }

  async function appendComment(annotationId: string, comment: Comment) {
    let found = false;
    const nextAnnotations = annotationsRef.current.map((annotation) => {
      if (annotation.id !== annotationId) return annotation;
      found = true;
      return { ...annotation, comments: [...annotation.comments, comment], updatedAt: new Date().toISOString() };
    });
    if (!found) return;

    await saveAnnotations(nextAnnotations);
    setActiveId(annotationId);
  }

  async function updateComment(annotationId: string, commentId: string, update: (comment: Comment) => Comment) {
    let found = false;
    const nextAnnotations = annotationsRef.current.map((annotation) => {
      if (annotation.id !== annotationId) return annotation;
      found = true;
      return {
        ...annotation,
        comments: annotation.comments.map((comment) => (comment.id === commentId ? update(comment) : comment)),
        updatedAt: new Date().toISOString()
      };
    });
    if (!found) return;

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

    const articleText = article.textContent || "";
    const start = offsetFromArticleStart(article, range.startContainer, range.startOffset);
    const end = offsetFromArticleStart(article, range.endContainer, range.endOffset);
    const anchor = createTextAnchor(articleText, start, end);
    const rect = range.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    setSelectionAction({
      x: Math.min(rect.left + rect.width / 2 - 46, window.innerWidth - 120),
      y: Math.min(rect.bottom + 10, window.innerHeight - 64),
      anchor
    });
    setTemporaryBoxes(
      rangeHighlightBoxes(range, canvasRect, "selection").map((box) => ({
        ...box,
        annotationId: "__selection__",
        color: userProfile.annotationColor
      }))
    );
    selection.removeAllRanges();
  }

  async function createAnnotation(note: string) {
    if (!composer) return;

    const now = new Date().toISOString();
    const comments = note.trim()
      ? [{
          id: makeId("comment"),
          author: "user" as const,
          content: note.trim(),
          createdAt: now,
          userUsername: userProfile.username,
          userNickname: userProfile.nickname,
          userAvatar: userProfile.avatar,
          userAnnotationColor: userProfile.annotationColor
        }]
      : [];
    const annotation: Annotation = {
      id: makeId("annotation"),
      anchor: composer.anchor,
      author: "user",
      color: userProfile.annotationColor,
      userUsername: userProfile.username,
      userNickname: userProfile.nickname,
      userAvatar: userProfile.avatar,
      userAnnotationColor: userProfile.annotationColor,
      comments,
      createdAt: now,
      updatedAt: now
    };

    await saveAnnotations([...annotations, annotation]);
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
    const nextAnnotations = annotations.filter((annotation) => annotation.id !== annotationId);
    noteRefs.current.delete(annotationId);
    for (const [requestId, pending] of pendingAgentRequestsRef.current) {
      if (pending.annotationId === annotationId) pendingAgentRequestsRef.current.delete(requestId);
    }
    await saveAnnotations(nextAnnotations);
    if (activeId === annotationId) setActiveId(null);
  }

  function enqueueAgentAnnotation(annotation: Annotation) {
    agentAnnotationQueueRef.current.push(annotation);
    readerLog("agent.queue.enqueue", { annotationId: annotation.id, size: agentAnnotationQueueRef.current.length });
  }

  function startVirtualReading(agent: PublicAgent) {
    if (virtualReadingTimerRef.current !== null) window.clearInterval(virtualReadingTimerRef.current);

    virtualReadingAgentRef.current = agent;
    const article = articleRef.current;
    const body = article?.querySelector(".reader-article-body");
    virtualReadingOffsetRef.current = article && body ? offsetFromArticleStart(article, body, 0) : 0;
    virtualReadingPausedRef.current = false;
    virtualReadingDoneRef.current = false;
    tickVirtualReading();
    virtualReadingTimerRef.current = window.setInterval(tickVirtualReading, 180);
    readerLog("virtual.reading.start", { agent: agent.username });
  }

  function tickVirtualReading() {
    if (virtualReadingPausedRef.current) return;

    const agent = virtualReadingAgentRef.current;
    const article = articleRef.current;
    const surface = surfaceRef.current;
    if (!agent || !article || !surface) return;

    const text = article.textContent || "";
    if (virtualReadingOffsetRef.current >= text.length - 1) {
      finishVirtualReading("读完了");
      return;
    }

    const position = cursorPositionFromOffset(article, surface, virtualReadingOffsetRef.current + 8);
    if (!position) return;

    virtualReadingOffsetRef.current = position.offset;
    setVirtualCursor({
      visible: true,
      x: position.x,
      y: position.y,
      label: position.offscreen ? `${agent.nickname} 正在${position.offscreen === "above" ? "上方" : "下方"}阅读` : `${agent.nickname} 正在阅读`,
      offscreen: position.offscreen,
      agent
    });
  }

  function finishVirtualReading(suffix = "批注完成") {
    const agent = virtualReadingAgentRef.current;
    if (virtualReadingTimerRef.current !== null) {
      window.clearInterval(virtualReadingTimerRef.current);
      virtualReadingTimerRef.current = null;
    }

    const current = virtualCursorRef.current;
    if (!current) return;

    setVirtualCursor({
      ...current,
      x: Math.min(window.innerWidth - 80, current.x + 72),
      y: Math.max(72, current.y - 42),
      label: `${agent?.nickname || "Agent"} ${suffix}`,
      leaving: true
    });
    window.setTimeout(() => setVirtualCursor(null), 900);
  }

  function finishVirtualReadingIfIdle() {
    if (!virtualReadingDoneRef.current || agentAnimationRunningRef.current || agentAnnotationQueueRef.current.length > 0) return;
    window.setTimeout(() => {
      if (virtualReadingDoneRef.current && !agentAnimationRunningRef.current && agentAnnotationQueueRef.current.length === 0) {
        finishVirtualReading();
      }
    }, 900);
  }

  async function processAgentAnnotationQueue() {
    if (agentAnimationRunningRef.current) return;

    agentAnimationRunningRef.current = true;
    try {
      while (agentAnnotationQueueRef.current.length > 0) {
        const annotation = agentAnnotationQueueRef.current.shift();
        if (!annotation) continue;

        try {
          readerLog("agent.queue.play", { annotationId: annotation.id, remaining: agentAnnotationQueueRef.current.length });
          virtualReadingPausedRef.current = true;
          await playAgentAnnotation(annotation);
        } catch (error) {
          readerLog("agent.queue.play.error", {
            annotationId: annotation.id,
            error: error instanceof Error ? error.message : String(error)
          });
          await saveAnnotations([...annotationsRef.current, annotation]);
        } finally {
          virtualReadingPausedRef.current = false;
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
    if (!article || !canvas || !surface) {
      readerLog("agent.play.no_surface", { annotationId: annotation.id });
      await saveAnnotations([...annotationsRef.current, annotation]);
      return;
    }

    const position = resolveTextAnchor(article.textContent || "", annotation.anchor);
    if (!position) {
      readerLog("agent.play.anchor_unresolved", { annotationId: annotation.id, exact: annotation.anchor.exact.slice(0, 80) });
      await saveAnnotations([...annotationsRef.current, annotation]);
      return;
    }

    const range = rangeFromOffsets(article, position.start, position.end);
    if (!range) {
      readerLog("agent.play.range_missing", { annotationId: annotation.id });
      await saveAnnotations([...annotationsRef.current, annotation]);
      return;
    }

    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width >= 2 && rect.height >= 2);
    const firstRect = rects[0];
    const lastRect = rects[rects.length - 1];
    if (!firstRect || !lastRect) return;

    const surfaceRect = surface.getBoundingClientRect();
    const isVisible = firstRect.bottom >= surfaceRect.top && firstRect.top <= surfaceRect.bottom;
    if (!isVisible) {
      setVirtualCursor({
        visible: true,
        x: surfaceRect.left + surfaceRect.width / 2,
        y: firstRect.top < surfaceRect.top ? surfaceRect.top + 18 : surfaceRect.bottom - 18,
        label: `${annotation.agentNickname || annotation.agentUsername || "Agent"} 正在${firstRect.top < surfaceRect.top ? "上方" : "下方"}批注`,
        offscreen: firstRect.top < surfaceRect.top ? "above" : "below",
        agent: annotationToAgent(annotation)
      });
      await sleep(700);
      await saveAnnotations([...annotationsRef.current, annotation]);
      setActiveId(annotation.id);
      return;
    }

    setVirtualCursor({
      visible: true,
      x: firstRect.left,
      y: firstRect.top + firstRect.height / 2,
      label: `${annotation.agentNickname || annotation.agentUsername || "Agent"} 正在批注`,
      offscreen: null,
      agent: annotationToAgent(annotation)
    });
    await sleep(420);

    const boxes = rangeHighlightBoxes(range, canvas.getBoundingClientRect(), `theater_${annotation.id}`).map((box) => ({ ...box, annotationId: annotation.id, color: annotation.color }));
    await animateTheaterHighlight(boxes, annotation.anchor.exact.length, (nextBoxes) => {
      const cursorBox = nextBoxes[nextBoxes.length - 1];
      if (cursorBox) {
        const canvasRect = canvas.getBoundingClientRect();
        setVirtualCursor({
          visible: true,
          x: canvasRect.left + cursorBox.left + cursorBox.width,
          y: canvasRect.top + cursorBox.top + cursorBox.height / 2,
          label: `${annotation.agentNickname || annotation.agentUsername || "Agent"} 正在批注`,
          offscreen: null,
          agent: annotationToAgent(annotation)
        });
      }
      setAgentTheaterBoxes(nextBoxes);
    });

    await saveAnnotations([...annotationsRef.current, annotation]);
    setActiveId(annotation.id);
    setAgentTheaterBoxes([]);
    setVirtualCursor({
      visible: true,
      x: lastRect.right,
      y: lastRect.top + lastRect.height / 2,
      label: `${annotation.agentNickname || annotation.agentUsername || "Agent"} 继续阅读`,
      offscreen: null,
      agent: annotationToAgent(annotation)
    });
    await sleep(360);
  }

  async function addComment(annotationId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const userComment: Comment = {
      id: makeId("comment"),
      author: "user",
      content: trimmed,
      createdAt: now,
      userUsername: userProfile.username,
      userNickname: userProfile.nickname,
      userAvatar: userProfile.avatar,
      userAnnotationColor: userProfile.annotationColor
    };
    const nextAnnotations = annotations.map((annotation) => {
      if (annotation.id !== annotationId) return annotation;
      return { ...annotation, comments: [...annotation.comments, userComment], updatedAt: now };
    });

    await saveAnnotations(nextAnnotations);
    setActiveId(annotationId);

    const mentionedAgents = findMentionedAgents(trimmed, agents);
    const nextAnnotation = nextAnnotations.find((annotation) => annotation.id === annotationId);
    if (nextAnnotation) {
      for (const agent of mentionedAgents) {
        sendAgentMessage(agent.username, nextAnnotation, userComment);
      }
    }
  }

  function sendAgentMessage(agentUsername: string, annotation: Annotation, userComment: Comment) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    socket.send(
      JSON.stringify({
        type: "agent:message",
        requestId: makeId("request"),
        payload: {
          agentUsername,
          article: { title: extracted.title, url: extracted.canonicalUrl, text: articleRef.current?.textContent || "" },
          annotation,
          userComment
        }
      })
    );
  }

  function requestAgentAnnotations(agentUsername: string) {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const requestId = makeId("request");
    pendingAgentRequestsRef.current.set(requestId, { annotationId: "", commentId: "" });
    setAnnotatingAgent(agentUsername);
    socket.send(
      JSON.stringify({
        type: "agent:annotate",
        requestId,
        payload: {
          agentUsername,
          article: { title: extracted.title, url: extracted.canonicalUrl, text: articleRef.current?.textContent || "" }
        }
      })
    );
  }

  function focusAnnotation(annotationId: string) {
    setActiveId(annotationId);
    noteRefs.current.get(annotationId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function scrollToHighlight(annotationId: string) {
    setActiveId(annotationId);
    const annotation = annotations.find((item) => item.id === annotationId);
    const article = articleRef.current;
    if (!annotation || !article) return;

    const position = resolveTextAnchor(article.textContent || "", annotation.anchor);
    if (!position) return;

    const range = rangeFromOffsets(article, position.start, position.end);
    const firstRect = range?.getClientRects()[0];
    if (firstRect) surfaceRef.current?.scrollBy({ top: firstRect.top - 180, behavior: "smooth" });
  }

  function scrollToHeading(id: string) {
    const heading = articleRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    const surface = surfaceRef.current;
    if (!heading || !surface) return;

    const headingRect = heading.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    surface.scrollBy({ top: headingRect.top - surfaceRect.top - 32, behavior: "smooth" });
  }

  const activeAnnotation = useMemo(() => annotations.find((item) => item.id === activeId) || null, [activeId, annotations]);

  return (
    <div
      className="reader-app"
      style={{ "--reader-font-size": `${readerSettings.fontSize}px`, "--reader-content-width": `${readerSettings.contentWidth}px` } as React.CSSProperties}
    >
      <header className="reader-toolbar">
        <div>
          <div className="reader-eyebrow">Reader Agent</div>
          <h1><span className={desktopConnected ? "reader-connection is-connected" : "reader-connection is-disconnected"} />{extracted.title}</h1>
          <p>{extracted.byline || extracted.canonicalUrl}</p>
        </div>
        <div className="reader-toolbar-actions">
          <button className={settingsOpen ? "reader-icon-button is-active" : "reader-icon-button"} type="button" onClick={() => setSettingsOpen((open) => !open)} aria-label="阅读设置">
            <Settings2 size={18} />
          </button>
          <button className="reader-close" type="button" onClick={onClose} aria-label="关闭阅读器"><X size={18} /></button>
        </div>
      </header>

      {settingsOpen ? <ReaderSettingsPanel settings={readerSettings} onChange={updateReaderSettings} /> : null}

      <main className="reader-main">
        <aside className={tocItems.length > 0 ? "reader-toc" : "reader-toc is-empty"}>
          <div className="reader-toc-title">目录</div>
          {tocItems.map((item) => <button className="reader-toc-item" data-depth={Math.min(item.depth, 4)} key={item.id} type="button" onClick={() => scrollToHeading(item.id)}>{item.text}</button>)}
        </aside>

        <section className="reader-surface" ref={surfaceRef} onMouseUp={handleMouseUp}>
          <div className="reader-canvas" ref={canvasRef}>
            <article className="reader-article" ref={articleRef}>
              <header className="reader-article-header">
                <h1>{extracted.title}</h1>
                {extracted.byline || extracted.excerpt ? <p>{[extracted.byline, extracted.excerpt].filter(Boolean).join(" · ")}</p> : null}
              </header>
              <div className="reader-article-body" dangerouslySetInnerHTML={{ __html: extracted.content }} />
            </article>
            <div className="reader-highlight-layer">
              {boxes.map((box) => <button className={box.annotationId === activeId ? "reader-highlight is-active" : "reader-highlight"} key={box.id} style={highlightStyle(box, box.annotationId === activeId)} type="button" onClick={() => focusAnnotation(box.annotationId)} />)}
              {temporaryBoxes.map((box) => <div className="reader-highlight is-temporary" key={box.id} style={highlightStyle(box, false)} />)}
              {agentTheaterBoxes.map((box) => <div className="reader-highlight is-agent-theater" key={box.id} style={highlightStyle(box, false)} />)}
            </div>
          </div>
        </section>

        <aside className="reader-notes">
          <div className="reader-notes-header">
            <strong>批注</strong>
            <div className="reader-notes-actions">
              <button className={agentAnnotateOpen ? "reader-agent-annotate is-active" : "reader-agent-annotate"} type="button" disabled={!desktopConnected || agents.length === 0 || Boolean(annotatingAgent)} onClick={() => setAgentAnnotateOpen((open) => !open)}><Bot size={14} />{annotatingAgent ? "批注中" : "Agent 批注"}</button>
              <span>{annotations.length}</span>
            </div>
          </div>
          {agentAnnotateOpen ? <AgentAnnotateMenu agents={agents} annotatingAgent={annotatingAgent} onSelect={requestAgentAnnotations} /> : null}
          {annotations.length === 0 ? <EmptyNotes /> : null}
          {annotations.map((annotation) => (
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

      {selectionAction && !composer ? <SelectionMenu action={selectionAction} onAnnotate={() => { setComposer({ x: Math.min(selectionAction.x, window.innerWidth - 340), y: Math.min(selectionAction.y + 44, window.innerHeight - 160), anchor: selectionAction.anchor }); setSelectionAction(null); }} /> : null}
      {composer ? <Composer composer={composer} shortcutModifier={shortcutModifier} onCancel={cancelComposer} onSave={createAnnotation} /> : null}
      {virtualCursor?.visible ? <VirtualCursor cursor={virtualCursor} /> : null}
    </div>
  );
}

function SelectionMenu({ action, onAnnotate }: { action: SelectionAction; onAnnotate: () => void }) {
  return <div className="reader-selection-menu" style={{ left: action.x, top: action.y }}><button type="button" onClick={onAnnotate}><MessageSquarePlus size={15} strokeWidth={2.2} />批注</button></div>;
}

function VirtualCursor({ cursor }: { cursor: VirtualCursorState }) {
  return (
    <div className={["reader-virtual-cursor", cursor.offscreen ? "is-offscreen" : "", cursor.leaving ? "is-leaving" : ""].filter(Boolean).join(" ")} style={{ left: cursor.x, top: cursor.y }}>
      <div className="reader-virtual-pointer" />
      <div className="reader-virtual-label"><AvatarBadge avatar={cursor.agent?.avatar} />{cursor.label}</div>
    </div>
  );
}

function AvatarBadge({ avatar, fallback = "AI" }: { avatar?: string; fallback?: string }) {
  const value = avatar || fallback;
  const image = isImageAvatar(value);
  const svg = isSvgAvatar(value);
  const classes = ["reader-avatar-badge", image ? "is-image" : "", svg ? "is-svg" : ""].filter(Boolean).join(" ");
  return <span className={classes}>{image ? <img alt="" src={value} /> : value}</span>;
}

function annotationAuthor(annotation: Annotation, userProfile: UserProfile) {
  if (annotation.author === "ai") {
    return {
      avatar: annotation.agentAvatar,
      fallback: "AI",
      nickname: annotation.agentNickname || annotation.agentUsername || "Agent",
      username: annotation.agentUsername || "agent",
      color: annotation.agentAnnotationColor || annotation.color
    };
  }

  return {
    avatar: annotation.userAvatar || userProfile.avatar,
    fallback: "我",
    nickname: annotation.userNickname || userProfile.nickname,
    username: annotation.userUsername || userProfile.username,
    color: annotation.userAnnotationColor || annotation.color || userProfile.annotationColor
  };
}

function commentPersona(comment: Comment, userProfile: UserProfile) {
  if (comment.author === "ai") {
    return {
      avatar: comment.agentAvatar,
      fallback: "AI",
      nickname: comment.agentNickname || comment.agentUsername || "Agent",
      username: comment.agentUsername || "agent",
      color: comment.agentAnnotationColor || defaultUserProfile.annotationColor
    };
  }

  return {
    avatar: comment.userAvatar || userProfile.avatar,
    fallback: "我",
    nickname: comment.userNickname || userProfile.nickname,
    username: comment.userUsername || userProfile.username,
    color: comment.userAnnotationColor || userProfile.annotationColor
  };
}

function EmptyNotes() {
  return <div className="reader-empty"><strong>选择一段文字开始批注</strong><p>选中阅读器内的文本后，可以写下想法。高亮和讨论会保存在当前文章下。</p></div>;
}

function AgentAnnotateMenu({ agents, annotatingAgent, onSelect }: { agents: PublicAgent[]; annotatingAgent: string | null; onSelect: (username: string) => void }) {
  return (
    <div className="reader-agent-annotate-menu">
      {agents.map((agent) => (
        <button disabled={Boolean(annotatingAgent)} key={agent.id} type="button" onClick={() => onSelect(agent.username)}>
          <AvatarBadge avatar={agent.avatar} />
          <strong>{agent.nickname}</strong>
          <em>{annotatingAgent === agent.username ? "阅读中..." : `@${agent.username}`}</em>
        </button>
      ))}
    </div>
  );
}

function ReaderSettingsPanel({ settings, onChange }: { settings: ReaderSettings; onChange: (settings: ReaderSettings) => void }) {
  return (
    <div className="reader-settings-panel">
      <SettingStepper icon={<CaseSensitive size={17} />} label="字号" value={`${settings.fontSize}px`} onDecrease={() => onChange({ ...settings, fontSize: Math.max(16, settings.fontSize - 1) })} onIncrease={() => onChange({ ...settings, fontSize: Math.min(28, settings.fontSize + 1) })} />
      <SettingStepper icon={<Maximize2 size={16} />} label="文章宽度" value={`${settings.contentWidth}px`} onDecrease={() => onChange({ ...settings, contentWidth: Math.max(680, settings.contentWidth - 40) })} onIncrease={() => onChange({ ...settings, contentWidth: Math.min(1080, settings.contentWidth + 40) })} />
    </div>
  );
}

function SettingStepper({ icon, label, value, onDecrease, onIncrease }: { icon: React.ReactNode; label: string; value: string; onDecrease: () => void; onIncrease: () => void }) {
  return <div className="reader-setting-row"><div className="reader-setting-label">{icon}<span>{label}</span></div><div className="reader-stepper"><button type="button" onClick={onDecrease} aria-label={`减少${label}`}><Minus size={14} /></button><strong>{value}</strong><button type="button" onClick={onIncrease} aria-label={`增加${label}`}><Plus size={14} /></button></div></div>;
}

function Composer({ composer, shortcutModifier, onCancel, onSave }: { composer: PendingComposer; shortcutModifier: string; onCancel: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="reader-composer" style={{ left: composer.x, top: composer.y }}>
      <textarea autoFocus placeholder="写下你的批注..." value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (isSubmitShortcut(event)) { event.preventDefault(); onSave(note); } }} />
      <div className="reader-composer-actions"><div className="reader-shortcut-hint"><Kbd className="reader-kbd">{shortcutModifier}</Kbd><Kbd className="reader-kbd">Enter</Kbd><span>保存</span></div><button type="button" onClick={onCancel}>取消</button><button type="button" onClick={() => onSave(note)}>保存批注</button></div>
    </div>
  );
}

function AnnotationCard({ active, agents, annotation, desktopConnected, noteRef, shortcutModifier, userProfile, onAddComment, onDelete, onFocus }: { active: boolean; agents: PublicAgent[]; annotation: Annotation; desktopConnected: boolean; noteRef: (element: HTMLElement | null) => void; shortcutModifier: string; userProfile: UserProfile; onAddComment: (annotationId: string, content: string) => void; onDelete: (annotationId: string) => void; onFocus: (annotationId: string) => void }) {
  const [draft, setDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionQuery = getMentionQuery(draft, caretIndex);
  const matchedAgents = mentionQuery === null ? [] : agents.filter((agent) => agent.username.toLowerCase().startsWith(mentionQuery.query.toLowerCase()) || agent.nickname.toLowerCase().includes(mentionQuery.query.toLowerCase())).slice(0, 5);
  const author = annotationAuthor(annotation, userProfile);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length) setSelectedMentionIndex(0);
  }, [matchedAgents.length, selectedMentionIndex]);

  function submit() {
    onAddComment(annotation.id, draft);
    setDraft("");
    setCaretIndex(0);
  }

  function selectAgent(agent: PublicAgent) {
    if (!mentionQuery) return;
    const nextDraft = replaceMentionQuery(draft, mentionQuery, agent.username);
    const nextCaretIndex = mentionQuery.start + agent.username.length + 2;
    setDraft(nextDraft);
    setCaretIndex(nextCaretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  function updateCaret(element: HTMLTextAreaElement) {
    setCaretIndex(element.selectionStart);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (matchedAgents.length > 0 && event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedMentionIndex((index) => (index + 1) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedMentionIndex((index) => (index - 1 + matchedAgents.length) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === "Tab") {
      event.preventDefault();
      selectAgent(matchedAgents[selectedMentionIndex] || matchedAgents[0]);
      return;
    }

    if (isSubmitShortcut(event)) {
      event.preventDefault();
      submit();
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab" || event.key === "ArrowDown" || event.key === "ArrowUp") return;
    updateCaret(event.currentTarget);
  }

  return (
    <section className={active ? "reader-note is-active" : "reader-note"} ref={noteRef} style={noteStyle(annotation.color, active)}>
      <button className="reader-note-anchor" type="button" onClick={() => onFocus(annotation.id)}>
        <span className="reader-note-persona"><AvatarBadge avatar={author.avatar} fallback={author.fallback} /><strong>{author.nickname}</strong><em>@{author.username}</em></span>
        <span className="reader-note-quote">“{annotation.anchor.exact}”</span>
      </button>
      <div className="reader-comments">
        {annotation.comments.length === 0 ? <p className="reader-muted">已高亮，暂无文字批注。</p> : null}
        {annotation.comments.map((comment) => {
          const commentAuthor = commentPersona(comment, userProfile);
          return (
            <div className="reader-comment" key={comment.id}>
              <AvatarBadge avatar={commentAuthor.avatar} fallback={commentAuthor.fallback} />
              <div className="reader-comment-body">
                <div className="reader-comment-author"><strong>{commentAuthor.nickname}</strong><em>@{commentAuthor.username}</em></div>
                <p>{comment.content}{comment.pending ? <i className="reader-spinner" /> : null}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="reader-comment-box">
        <textarea
          autoFocus={active}
          ref={textareaRef}
          placeholder={desktopConnected ? "继续评论，输入 @ 呼叫 Agent..." : "继续评论..."}
          value={draft}
          onChange={(event) => { setDraft(event.currentTarget.value); updateCaret(event.currentTarget); }}
          onClick={(event) => updateCaret(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onSelect={(event) => updateCaret(event.currentTarget)}
        />
        {matchedAgents.length > 0 ? <div className="reader-agent-menu">{matchedAgents.map((agent, index) => <button className={index === selectedMentionIndex ? "is-active" : ""} key={agent.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectAgent(agent)}><AvatarBadge avatar={agent.avatar} /><strong>{agent.nickname}</strong><em>@{agent.username}</em></button>)}</div> : null}
      </div>
      <div className="reader-note-footer">
        {confirmingDelete ? <div className="reader-delete-confirm"><span>删除这条批注？</span><button type="button" onClick={() => setConfirmingDelete(false)}>取消</button><button type="button" onClick={() => onDelete(annotation.id)}>确认删除</button></div> : <button className="reader-delete-note" type="button" onClick={() => setConfirmingDelete(true)}><Trash2 size={13} />删除批注</button>}
        <div className="reader-shortcut-hint"><Kbd className="reader-kbd">{shortcutModifier}</Kbd><Kbd className="reader-kbd">Enter</Kbd><span>发送</span></div>
        <button className="reader-add-comment" type="button" onClick={submit}>添加评论</button>
      </div>
    </section>
  );
}

function isRangeInsideArticle(range: Range, article: HTMLElement) {
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentNode;
  const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentNode;
  return Boolean(start && end && article.contains(start) && article.contains(end));
}

function extractTocItems(article: HTMLElement) {
  const semanticHeadings = collectTocCandidates(Array.from(article.querySelectorAll<HTMLElement>("h1, h2, h3, h4")), (element) => Number(element.tagName.slice(1)) - 1);
  if (semanticHeadings.length > 0) return semanticHeadings;

  const inferredHeadings = Array.from(article.querySelectorAll<HTMLElement>("p, div, section"))
    .filter((element) => {
      const text = element.textContent?.trim() || "";
      return text.length >= 3 && text.length <= 80 && /^((第?[一二三四五六七八九十百]+|\d+)[、.．]|[一二三四五六七八九十]+、)/.test(text);
    })
    .filter((element) => !element.querySelector("p, div, section, h1, h2, h3, h4"))
    .slice(0, 24);

  return collectTocCandidates(inferredHeadings, () => 1);
}

function collectTocCandidates(elements: HTMLElement[], getDepth: (element: HTMLElement) => number) {
  return elements.map((element, index) => {
    const text = element.textContent?.trim().replace(/\s+/g, " ") || "";
    if (!text) return null;
    if (!element.id) element.id = `reader-heading-${hashText(`${index}:${text}`)}`;
    return { id: element.id, text, depth: getDepth(element) };
  }).filter((item): item is TocItem => Boolean(item));
}

function offsetFromArticleStart(article: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(article);
  range.setEnd(node, offset);
  return range.toString().length;
}

function getArticleSelection(article: HTMLElement) {
  const rootNode = article.getRootNode();
  if (rootNode instanceof ShadowRoot) return rootNode.getSelection();
  return article.ownerDocument.getSelection();
}

function getShortcutModifier() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘" : "Ctrl";
}

function isSubmitShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return event.key === "Enter" && (isMac ? event.metaKey : event.ctrlKey);
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function highlightStyle(box: HighlightBox, active: boolean): React.CSSProperties {
  const color = box.color || defaultUserProfile.annotationColor;
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    backgroundColor: alphaColor(color, active ? 0.45 : 0.28),
    boxShadow: `0 0 0 ${active ? 2 : 1}px ${alphaColor(color, active ? 0.72 : 0.36)}`
  };
}

function noteStyle(color: string, active: boolean): React.CSSProperties {
  const accent = color || defaultUserProfile.annotationColor;
  return {
    borderColor: alphaColor(accent, active ? 0.82 : 0.38),
    boxShadow: active ? `0 0 0 3px ${alphaColor(accent, 0.18)}, 0 10px 34px rgba(55,42,24,.08)` : undefined
  };
}

function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(244,201,93,${alpha})`;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function findMentionedAgents(content: string, agents: PublicAgent[]) {
  const byUsername = new Map(agents.map((agent) => [agent.username, agent]));
  const mentionedAgents: PublicAgent[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/@([a-zA-Z0-9_-]+)/g)) {
    const username = match[1];
    const agent = byUsername.get(username);
    if (!agent || seen.has(username)) continue;
    seen.add(username);
    mentionedAgents.push(agent);
  }

  return mentionedAgents;
}

function getMentionQuery(content: string, caretIndex: number) {
  const prefix = content.slice(0, caretIndex);
  const match = prefix.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
  if (!match || match.index === undefined) return null;
  return {
    query: match[2],
    start: match.index + match[1].length,
    end: caretIndex
  };
}

function replaceMentionQuery(content: string, mentionQuery: { start: number; end: number }, username: string) {
  return `${content.slice(0, mentionQuery.start)}@${username} ${content.slice(mentionQuery.end)}`;
}

function annotationToAgent(annotation: Annotation): PublicAgent | undefined {
  if (!annotation.agentId || !annotation.agentUsername) return undefined;
  return {
    id: annotation.agentId,
    username: annotation.agentUsername,
    nickname: annotation.agentNickname || annotation.agentUsername,
    avatar: annotation.agentAvatar || "AI",
    annotationColor: annotation.agentAnnotationColor || annotation.color
  };
}

function isImageAvatar(value: string) {
  return value.startsWith("data:image/") || value.startsWith("blob:") || value.startsWith("http") || value.startsWith("/");
}

function isSvgAvatar(value: string) {
  return value.startsWith("data:image/svg+xml") || value.endsWith(".svg");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cursorPositionFromOffset(article: HTMLElement, surface: HTMLElement, offset: number) {
  const text = article.textContent || "";
  const surfaceRect = surface.getBoundingClientRect();
  const start = Math.max(0, Math.min(offset, text.length - 1));

  for (let cursor = start; cursor < Math.min(text.length - 1, start + 120); cursor += 1) {
    if (!text[cursor]?.trim()) continue;

    const range = rangeFromOffsets(article, cursor, cursor + 1);
    const rect = range?.getClientRects()[0];
    if (!rect || rect.width < 1 || rect.height < 1) continue;

    const offscreen = rect.bottom < surfaceRect.top ? "above" : rect.top > surfaceRect.bottom ? "below" : null;
    return {
      offset: cursor,
      x: offscreen ? surfaceRect.left + surfaceRect.width / 2 : rect.left + rect.width,
      y: offscreen === "above" ? surfaceRect.top + 20 : offscreen === "below" ? surfaceRect.bottom - 20 : rect.top + rect.height / 2,
      offscreen: offscreen as "above" | "below" | null
    };
  }

  return null;
}

function animateTheaterHighlight(boxes: HighlightBox[], textLength: number, onFrame: (boxes: HighlightBox[]) => void) {
  const sortedBoxes = [...boxes].sort((a, b) => a.top - b.top || a.left - b.left);
  const duration = clampNumber(textLength * 28, 780, 2600, 1200);
  const start = performance.now();

  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const boxProgress = eased * sortedBoxes.length;
      const nextBoxes = sortedBoxes.flatMap((box, index) => {
        if (index < Math.floor(boxProgress)) return [box];
        if (index > Math.floor(boxProgress)) return [];

        const width = box.width * Math.max(0.08, boxProgress - index);
        return [{ ...box, width }];
      });
      onFrame(nextBoxes);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        onFrame(sortedBoxes);
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
}

function rangeHighlightBoxes(range: Range, canvasRect: DOMRect, idPrefix: string): HighlightBox[] {
  const rects: DOMRect[] = [];
  const collectNodeRects = (node: Text) => {
    const nodeRange = document.createRange();
    nodeRange.setStart(node, node === range.startContainer ? range.startOffset : 0);
    nodeRange.setEnd(node, node === range.endContainer ? range.endOffset : node.data.length);
    rects.push(...Array.from(nodeRange.getClientRects()));
  };

  if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
    const node = range.commonAncestorContainer as Text;
    if (node.textContent?.trim()) collectNodeRects(node);
  } else {
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    collectNodeRects(node);
  }
  }

  return mergeLineRects(rects)
    .filter((rect) => rect.width >= 2 && rect.height >= 2)
    .map((rect, index) => ({
      id: `${idPrefix}_${index}`,
      annotationId: "",
      color: defaultUserProfile.annotationColor,
      top: rect.top - canvasRect.top,
      left: rect.left - canvasRect.left,
      width: rect.width,
      height: rect.height
    }));
}

function mergeLineRects(rects: DOMRect[]) {
  const lines: Array<{ top: number; left: number; right: number; bottom: number }> = [];
  for (const rect of rects) {
    if (rect.width < 2 || rect.height < 2) continue;
    const line = lines.find((item) => Math.abs(item.top - rect.top) < 3 && Math.abs(item.bottom - rect.bottom) < 3);
    if (line) {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    } else {
      lines.push({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom });
    }
  }

  return lines.map((line) => ({
    top: line.top,
    left: line.left,
    right: line.right,
    bottom: line.bottom,
    width: line.right - line.left,
    height: line.bottom - line.top
  }));
}

function rangeFromOffsets(rootElement: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nextOffset = currentOffset + node.data.length;
    if (!startNode && start >= currentOffset && start <= nextOffset) {
      startNode = node;
      startOffset = start - currentOffset;
    }
    if (!endNode && end >= currentOffset && end <= nextOffset) {
      endNode = node;
      endOffset = end - currentOffset;
      break;
    }
    currentOffset = nextOffset;
  }

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

const readerConversationStyles = `
.reader-main{grid-template-columns:260px minmax(0,1fr) 460px}
.reader-highlight{background:rgba(244,201,93,.28);box-shadow:0 0 0 1px rgba(239,169,39,.24)}
.reader-highlight.is-active{background:rgba(244,201,93,.45)}
.reader-notes{padding:28px 24px 48px}
.reader-note{border-left-width:4px;border-radius:16px;padding:14px 15px}
.reader-note-anchor{display:grid;gap:10px}
.reader-note-anchor .reader-note-persona{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:8px;margin:0;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-note-persona .reader-avatar-badge{width:32px;height:32px}
.reader-note-persona strong{overflow:hidden;font-size:13px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-note-persona em{color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:700}
.reader-note-anchor .reader-note-quote{display:block;color:var(--reader-ink);font-family:Charter,Georgia,Cambria,"Times New Roman",serif;font-size:15px;font-weight:650;line-height:1.5}
.reader-comments{display:grid;gap:12px;margin-top:14px}
.reader-comment{grid-template-columns:32px minmax(0,1fr);gap:10px;margin-top:0}
.reader-comment .reader-avatar-badge{width:30px;height:30px}
.reader-note-anchor .reader-avatar-badge,.reader-comment .reader-avatar-badge,.reader-agent-menu .reader-avatar-badge,.reader-agent-annotate-menu .reader-avatar-badge,.reader-virtual-label .reader-avatar-badge{display:grid;place-items:center;overflow:hidden;border-radius:999px;background:var(--reader-green);color:white;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:800;padding:0;margin:0}
.reader-avatar-badge.is-image{background:transparent;color:inherit}
.reader-avatar-badge img{width:100%;height:100%;object-fit:cover;border-radius:999px}
.reader-avatar-badge.is-svg img{object-fit:contain}
.reader-agent-menu button.is-active{background:#f0e3cd}
.reader-comment-body{min-width:0}
.reader-comment-author{display:flex;align-items:baseline;gap:6px;margin-bottom:3px;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-comment-author strong{font-size:12px;font-weight:850}
.reader-comment-author em{color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:700}
.reader-comment-body p{margin:0;color:#3f352c;font-size:13px;line-height:1.6}
.reader-note-anchor>span{padding:0;margin:0;background:transparent;border-radius:0}
@media(max-width:980px){.reader-notes{width:min(460px,calc(100vw - 28px))}}
`;

const readerStyles = `
:host{all:initial;color-scheme:light;--reader-bg:#f3efe4;--reader-paper:#fffaf0;--reader-ink:#251d16;--reader-muted:#776b5f;--reader-line:#ded2bd;--reader-green:#173f2c;--reader-yellow:#f4c95d;--reader-yellow-strong:#efa927;font-family:Charter,Georgia,Cambria,"Times New Roman",serif}*{box-sizing:border-box}.reader-app{position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-rows:auto 1fr;background:radial-gradient(circle at 16% 12%,rgba(244,201,93,.25),transparent 28%),linear-gradient(135deg,#efe7d6 0%,#f8f3e8 48%,#e7eddf 100%);color:var(--reader-ink)}.reader-toolbar{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:84px;padding:18px 28px 16px;border-bottom:1px solid rgba(37,29,22,.12);background:rgba(255,250,240,.82);backdrop-filter:blur(18px)}.reader-eyebrow{color:var(--reader-green);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.reader-toolbar h1{display:flex;align-items:center;gap:9px;max-width:900px;margin:4px 0 2px;overflow:hidden;font-size:22px;line-height:1.15;text-overflow:ellipsis;white-space:nowrap}.reader-toolbar p{max-width:900px;margin:0;overflow:hidden;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.reader-connection{width:10px;height:10px;border-radius:999px;box-shadow:0 0 0 3px rgba(0,0,0,.05)}.reader-connection.is-connected{background:#18a058}.reader-connection.is-disconnected{background:#cf3f2f}.reader-toolbar-actions{display:flex;align-items:center;gap:10px}.reader-close,.reader-icon-button{display:grid;width:38px;height:38px;place-items:center;border:1px solid rgba(37,29,22,.18);border-radius:999px;background:#fff7e7;color:var(--reader-ink);cursor:pointer}.reader-icon-button:hover,.reader-icon-button.is-active,.reader-close:hover{background:#f0e3cd}.reader-settings-panel{position:fixed;right:28px;top:96px;z-index:6;width:280px;padding:14px;border:1px solid rgba(37,29,22,.14);border-radius:18px;background:rgba(255,250,240,.96);box-shadow:0 20px 70px rgba(55,42,24,.2);backdrop-filter:blur(16px);font-family:ui-sans-serif,system-ui,sans-serif}.reader-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}.reader-setting-row+.reader-setting-row{border-top:1px solid rgba(37,29,22,.1)}.reader-setting-label{display:inline-flex;align-items:center;gap:8px;color:var(--reader-muted);font-size:13px;font-weight:720}.reader-stepper{display:inline-flex;align-items:center;overflow:hidden;border:1px solid rgba(37,29,22,.14);border-radius:999px;background:#fffdf7}.reader-stepper button{display:grid;width:30px;height:30px;place-items:center;border:0;background:transparent;color:var(--reader-muted);cursor:pointer}.reader-stepper button:hover{background:rgba(23,63,44,.08);color:var(--reader-green)}.reader-stepper strong{min-width:58px;color:var(--reader-ink);font-size:12px;text-align:center}.reader-main{min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr) 360px}.reader-toc{min-width:0;overflow:auto;padding:42px 18px 48px 22px;border-right:1px solid rgba(37,29,22,.1);background:rgba(246,239,224,.58);font-family:ui-sans-serif,system-ui,sans-serif}.reader-toc.is-empty{visibility:hidden}.reader-toc-title{margin:0 0 12px;color:var(--reader-green);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.reader-toc-item{display:block;width:100%;margin:2px 0;border:0;border-radius:10px;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:13px;line-height:1.35;padding:7px 8px;text-align:left}.reader-toc-item:hover{background:rgba(255,250,240,.72);color:var(--reader-ink)}.reader-toc-item[data-depth="2"]{padding-left:20px}.reader-toc-item[data-depth="3"]{padding-left:32px}.reader-toc-item[data-depth="4"]{padding-left:44px}.reader-surface{min-width:0;overflow:auto;padding:42px 48px 84px}.reader-canvas{position:relative;width:min(var(--reader-content-width),100%);margin:0 auto}.reader-article{position:relative;z-index:1;padding:56px 64px;border:1px solid rgba(37,29,22,.12);border-radius:28px;background:rgba(255,250,240,.94);box-shadow:0 24px 80px rgba(55,42,24,.16);font-size:var(--reader-font-size);line-height:1.78;overflow-wrap:anywhere;word-break:break-word}.reader-article-header{margin-bottom:42px;padding-bottom:28px;border-bottom:1px solid rgba(37,29,22,.12)}.reader-article-header h1{margin:0;color:var(--reader-ink);font-size:36px;letter-spacing:-.035em;line-height:1.18}.reader-article-header p{margin:14px 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5}.reader-article *{max-width:100%;min-width:0;overflow-wrap:anywhere}.reader-article img,.reader-article video,.reader-article iframe{max-width:100%;height:auto;border-radius:14px}.reader-article pre{overflow:auto;padding:18px;border-radius:16px;background:#1f261f;color:#f7efd9}.reader-article table{display:block;max-width:100%;overflow-x:auto}.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:#574b3e}.reader-highlight-layer{position:absolute;inset:0;z-index:3;pointer-events:none}.reader-highlight{position:absolute;border:0;border-radius:4px;background:rgba(244,201,93,.42);box-shadow:0 0 0 1px rgba(239,169,39,.2);cursor:pointer;mix-blend-mode:multiply;padding:0;pointer-events:auto}.reader-highlight.is-active{background:rgba(239,169,39,.58);box-shadow:0 0 0 2px rgba(23,63,44,.55)}.reader-highlight.is-temporary{background:rgba(25,128,96,.22);box-shadow:0 0 0 1px rgba(25,128,96,.28);pointer-events:none}.reader-highlight.is-agent-theater{background:rgba(25,128,96,.3);box-shadow:0 0 0 1px rgba(25,128,96,.32);pointer-events:none}.reader-selection-menu{position:fixed;z-index:5;padding:5px;border-radius:999px;background:rgba(39,36,32,.92);box-shadow:0 12px 34px rgba(37,29,22,.28)}.reader-selection-menu button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;border:0;border-radius:999px;background:transparent;color:#fff8e8;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:750;padding:0 12px}.reader-virtual-cursor{position:fixed;z-index:7;display:flex;align-items:center;gap:8px;pointer-events:none;transform:translate(-4px,-4px);transition:left .42s ease,top .42s ease}.reader-virtual-pointer{width:0;height:0;border-left:13px solid var(--reader-green);border-top:9px solid transparent;border-bottom:9px solid transparent;filter:drop-shadow(0 4px 8px rgba(23,63,44,.22));transform:rotate(-18deg)}.reader-virtual-label{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(23,63,44,.16);border-radius:999px;background:rgba(255,250,240,.96);box-shadow:0 12px 36px rgba(55,42,24,.18);color:var(--reader-green);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:820;padding:6px 10px;white-space:nowrap}.reader-virtual-label span{display:grid;width:22px;height:22px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px}.reader-virtual-cursor.is-offscreen .reader-virtual-pointer{opacity:.45}.reader-virtual-cursor.is-leaving{animation:reader-cursor-leave .9s ease forwards}@keyframes reader-cursor-leave{to{opacity:0;transform:translate(18px,-24px) scale(.86);filter:blur(2px)}}.reader-notes{min-width:0;overflow:auto;padding:28px 22px 48px;border-left:1px solid rgba(37,29,22,.12);background:rgba(246,239,224,.86)}.reader-notes-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;margin:-28px -22px 18px;padding:18px 22px;background:rgba(246,239,224,.94);backdrop-filter:blur(14px);font-family:ui-sans-serif,system-ui,sans-serif}.reader-notes-actions{display:flex;align-items:center;gap:8px}.reader-notes-actions span{display:grid;min-width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px}.reader-agent-annotate{display:inline-flex;align-items:center;gap:6px;height:30px;border:1px solid rgba(37,29,22,.14);border-radius:999px;background:#fff7e7;color:var(--reader-green);cursor:pointer;font:inherit;font-size:12px;font-weight:800;padding:0 10px}.reader-agent-annotate:hover,.reader-agent-annotate.is-active{background:#f0e3cd}.reader-agent-annotate:disabled{cursor:not-allowed;opacity:.55}.reader-agent-annotate-menu{display:grid;gap:6px;margin:-6px 0 14px;padding:10px;border:1px solid rgba(37,29,22,.12);border-radius:16px;background:rgba(255,250,240,.92);box-shadow:0 12px 36px rgba(55,42,24,.1);font-family:ui-sans-serif,system-ui,sans-serif}.reader-agent-annotate-menu button{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:var(--reader-ink);cursor:pointer;padding:8px;text-align:left}.reader-agent-annotate-menu button:hover{background:#f0e3cd}.reader-agent-annotate-menu button:disabled{cursor:not-allowed;opacity:.65}.reader-agent-annotate-menu button>span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px;font-weight:800}.reader-agent-annotate-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-empty,.reader-note{margin-bottom:14px;padding:16px;border:1px solid rgba(37,29,22,.12);border-radius:18px;background:rgba(255,250,240,.86);box-shadow:0 10px 34px rgba(55,42,24,.08)}.reader-empty strong,.reader-note-anchor{font-family:ui-sans-serif,system-ui,sans-serif;font-weight:750}.reader-empty p,.reader-muted{margin:8px 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.6}.reader-note.is-active{border-color:rgba(23,63,44,.45);box-shadow:0 0 0 3px rgba(23,63,44,.12),0 10px 34px rgba(55,42,24,.08)}.reader-note-anchor{width:100%;border:0;background:transparent;color:var(--reader-ink);cursor:pointer;font-size:14px;line-height:1.5;padding:0;text-align:left}.reader-note-anchor span{display:inline-flex;align-items:center;margin:0 6px 6px 0;border-radius:999px;background:rgba(23,63,44,.1);color:var(--reader-green);font-size:12px;font-weight:800;padding:3px 8px}.reader-comments{margin-top:12px}.reader-comment{display:grid;grid-template-columns:32px 1fr;gap:9px;margin-top:10px;font-family:ui-sans-serif,system-ui,sans-serif}.reader-comment span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px;font-weight:800}.reader-comment p{margin:0;color:#3f352c;font-size:13px;line-height:1.55}.reader-avatar-badge img{width:100%;height:100%;object-fit:cover;border-radius:999px}.reader-spinner{display:inline-block;width:12px;height:12px;margin-left:6px;vertical-align:-2px;border:2px solid rgba(23,63,44,.22);border-top-color:var(--reader-green);border-radius:999px;animation:reader-spin .8s linear infinite}@keyframes reader-spin{to{transform:rotate(360deg)}}.reader-comment-box{position:relative}.reader-note textarea,.reader-composer textarea{width:100%;min-height:74px;resize:vertical;margin-top:12px;padding:10px 12px;border:1px solid rgba(37,29,22,.16);border-radius:12px;background:#fffdf7;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.5;outline:none}.reader-composer textarea{margin-top:0}.reader-agent-menu{position:absolute;left:0;right:0;bottom:calc(100% - 8px);z-index:4;display:grid;gap:4px;padding:8px;border:1px solid rgba(37,29,22,.12);border-radius:14px;background:#fffaf0;box-shadow:0 18px 50px rgba(55,42,24,.18)}.reader-agent-menu button{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;cursor:pointer;padding:7px;text-align:left}.reader-agent-menu button:hover{background:#f0e3cd}.reader-agent-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-add-comment,.reader-composer-actions button{border:0;border-radius:999px;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760}.reader-delete-note{display:inline-flex;align-items:center;gap:5px;margin-right:auto;border:0;background:transparent;color:#8a3f32;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760}.reader-delete-confirm{display:inline-flex;align-items:center;gap:6px;margin-right:auto;color:#6b5d50;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px}.reader-delete-confirm button{border:0;border-radius:999px;background:#eadfce;color:#4c4137;cursor:pointer;font:inherit;font-weight:760;padding:6px 9px}.reader-delete-confirm button:last-child{background:#8a3f32;color:white}.reader-add-comment{padding:9px 13px;background:var(--reader-green);color:white}.reader-note-footer,.reader-composer-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}.reader-shortcut-hint{display:inline-flex;align-items:center;gap:5px;margin-right:auto;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px}.reader-kbd{display:inline-flex;min-width:20px;height:20px;align-items:center;justify-content:center;border:1px solid rgba(37,29,22,.18);border-bottom-color:rgba(37,29,22,.32);border-radius:6px;background:#fffdf7;box-shadow:0 1px 0 rgba(37,29,22,.18);color:#4c4137;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:10px;font-weight:750;line-height:1;padding:0 5px}.reader-composer{position:fixed;z-index:5;width:340px;padding:14px;border:1px solid rgba(37,29,22,.16);border-radius:18px;background:rgba(255,250,240,.98);box-shadow:0 24px 80px rgba(55,42,24,.26)}.reader-quote{max-height:92px;overflow:auto;padding:10px 12px;border-left:4px solid var(--reader-yellow-strong);background:rgba(244,201,93,.16);color:#3f352c;font-size:13px;line-height:1.5}.reader-composer-actions button{padding:9px 13px;background:#e6dbc8;color:var(--reader-ink)}.reader-composer-actions button:last-child{background:var(--reader-green);color:white}@media(max-width:980px){.reader-main{grid-template-columns:1fr}.reader-toc{display:none}.reader-notes{position:fixed;right:14px;bottom:14px;width:min(380px,calc(100vw - 28px));max-height:42vh;border:1px solid rgba(37,29,22,.14);border-radius:22px;box-shadow:0 20px 70px rgba(55,42,24,.2)}.reader-surface{padding:24px 18px 220px}.reader-article{padding:34px 24px;font-size:18px}.reader-toolbar{padding:14px 16px}}
`;
