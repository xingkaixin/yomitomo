import React, { useEffect, useState } from 'react';
import { Check, LoaderCircle, MessageSquareText, Send } from 'lucide-react';
import { browser } from 'wxt/browser';
import type { ArticleRecord } from '@yomitomo/shared';
import type { ArticlePreview, ExtractedArticle } from './article-extraction';
import { Button } from './components/ui/button';
import { DESKTOP_PAIRING_TOKEN_KEY } from './desktop-bridge';
import { readExtensionStorage } from './extension-runtime';
import { connectPopupDesktop, type PopupDesktopClient } from './popup-desktop';
import { getArticleInTab, getArticlePreviewInTab, toggleReaderInTab } from './popup-actions';

type PageState =
  | { type: 'loading' }
  | { type: 'readable'; tabId: number; article: ArticlePreview }
  | { type: 'unavailable'; message: string };

type DesktopConnectionState = 'checking' | 'unpaired' | 'paired' | 'connected' | 'disconnected';
type SubmitState = 'hidden' | 'available' | 'submitting' | 'done' | 'hiding';

export function Popup() {
  const [status, setStatus] = useState('准备进入阅读器模式');
  const [desktopConnection, setDesktopConnection] = useState<DesktopConnectionState>('checking');
  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });
  const [submitState, setSubmitState] = useState<SubmitState>('hidden');
  const desktopClientRef = React.useRef<PopupDesktopClient | null>(null);
  const submitTimersRef = React.useRef<number[]>([]);

  useEffect(() => {
    return () => {
      clearSubmitTimers();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function inspectCurrentTab() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const unavailableMessage = unavailableTabMessage(tab);
      if (unavailableMessage) {
        if (active) setPageState({ type: 'unavailable', message: unavailableMessage });
        return;
      }

      const tabId = tab.id!;
      try {
        const article = await getArticlePreviewInTab(tabId);
        if (active) setPageState({ type: 'readable', tabId, article });
      } catch (error) {
        if (active) setPageState({ type: 'unavailable', message: errorMessage(error) });
      }
    }

    inspectCurrentTab().catch((error: unknown) => {
      if (active) setPageState({ type: 'unavailable', message: errorMessage(error) });
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let client: PopupDesktopClient | null = null;
    desktopClientRef.current?.close();
    desktopClientRef.current = null;
    clearSubmitTimers();
    setSubmitState('hidden');

    readExtensionStorage([DESKTOP_PAIRING_TOKEN_KEY])
      .then(async (stored) => {
        if (!active) return;
        const token = stored?.[DESKTOP_PAIRING_TOKEN_KEY];
        if (typeof token !== 'string' || token.trim().length === 0) {
          setDesktopConnection('unpaired');
          return;
        }

        setDesktopConnection('paired');
        if (pageState.type !== 'readable') return;

        client = await connectPopupDesktop(token);
        if (!active) {
          client.close();
          return;
        }

        desktopClientRef.current = client;
        setDesktopConnection('connected');
        const article = await client.getArticle(articleIdentity(pageState.article));
        if (!active) return;

        if (article) {
          setStatus('这篇文章已在阅读库');
          setSubmitState('hidden');
          return;
        }

        setStatus('可发送到阅读库，也可进入阅读器模式');
        setSubmitState('available');
      })
      .catch(() => {
        if (!active) return;
        client?.close();
        if (desktopClientRef.current === client) desktopClientRef.current = null;
        setDesktopConnection('disconnected');
        setSubmitState('hidden');
      });

    return () => {
      active = false;
      client?.close();
      if (desktopClientRef.current === client) desktopClientRef.current = null;
    };
  }, [pageState]);

  async function toggleReader() {
    if (pageState.type !== 'readable') return;

    try {
      setStatus('正在打开阅读器…');
      await toggleReaderInTab(pageState.tabId);
      setStatus('已发送到当前网页');
      window.close();
    } catch (error) {
      setStatus(`打开失败：${errorMessage(error)}`);
    }
  }

  async function submitArticle() {
    if (pageState.type !== 'readable' || submitState !== 'available') return;
    const client = desktopClientRef.current;
    if (!client) return;

    try {
      setSubmitState('submitting');
      setStatus('正在发送到阅读库…');
      const article = await getArticleInTab(pageState.tabId, {
        inlineImages: Boolean(client.settings.saveArticleImages),
      });
      const existing = await client.getArticle(articleIdentity(article));
      if (existing) {
        setStatus('这篇文章已在阅读库');
        completeSubmit();
        return;
      }

      await client.saveArticle(articleRecordFromExtractedArticle(article));
      setStatus('已发送到阅读库');
      completeSubmit();
    } catch (error) {
      setStatus(`发送失败：${errorMessage(error)}`);
      setSubmitState('available');
    }
  }

  function completeSubmit() {
    clearSubmitTimers();
    setSubmitState('done');
    submitTimersRef.current = [
      window.setTimeout(() => setSubmitState('hiding'), 700),
      window.setTimeout(() => setSubmitState('hidden'), 1040),
    ];
  }

  function clearSubmitTimers() {
    for (const timer of submitTimersRef.current) window.clearTimeout(timer);
    submitTimersRef.current = [];
  }

  const pairingView = desktopPairingView(desktopConnection);
  const readerDisabled = pageState.type !== 'readable';
  const articleCard = articleCardContent(pageState);
  const showSubmit = submitState !== 'hidden';

  return (
    <main className="relative w-80 bg-background p-4">
      <div
        aria-label={`配对状态：${pairingView.label}`}
        className={`absolute right-4 top-4 inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold shadow-sm ${pairingView.badgeClass}`}
      >
        <span className={`size-2 rounded-full ${pairingView.dotClass}`} />
        {pairingView.label}
      </div>
      <div className="mb-4 flex items-center gap-3 pr-24">
        <div className="grid size-12 place-items-center overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          <img
            alt=""
            className="size-12 [outline:1px_solid_rgba(0,0,0,0.1)] [outline-offset:-1px]"
            src="/icon/128.png"
          />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-normal">Yomitomo</h1>
          <p className="text-xs text-muted-foreground">伴读、高亮、批注讨论</p>
        </div>
      </div>
      <section
        aria-live="polite"
        className="mb-3 rounded-2xl border border-border bg-muted/45 p-4 shadow-sm"
      >
        <p className="text-xs font-bold text-muted-foreground">{articleCard.kicker}</p>
        <h2 className="mt-1 line-clamp-2 text-base font-black leading-6">{articleCard.title}</h2>
        <p className="mt-2 text-sm font-bold text-muted-foreground">{articleCard.meta}</p>
      </section>
      {showSubmit ? (
        <div
          className={`yomitomo-send-action mb-2 overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-out ${
            submitState === 'hiding'
              ? 'mb-0 max-h-0 -translate-y-1 opacity-0'
              : 'max-h-12 translate-y-0 opacity-100'
          }`}
        >
          <Button
            className={`h-11 w-full rounded-2xl shadow-sm ${
              submitState === 'done' ? 'bg-emerald-600 text-white hover:bg-emerald-600' : ''
            }`}
            disabled={submitState === 'submitting' || submitState === 'done'}
            onClick={submitArticle}
            variant="secondary"
          >
            {submitState === 'submitting' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : submitState === 'done' ? (
              <Check className="yomitomo-submit-done-icon size-4" />
            ) : (
              <Send className="size-4" />
            )}
            {submitState === 'submitting'
              ? '发送中'
              : submitState === 'done'
                ? '已发送'
                : '发送到阅读库'}
          </Button>
        </div>
      ) : null}
      <Button
        className="h-11 w-full rounded-2xl shadow-sm"
        disabled={readerDisabled}
        onClick={toggleReader}
      >
        <MessageSquareText className="size-4" />
        进入阅读器模式
      </Button>
      <p aria-live="polite" className="mt-3 text-xs leading-5 text-muted-foreground" role="status">
        {status}
      </p>
    </main>
  );
}

function desktopPairingView(state: DesktopConnectionState) {
  if (state === 'connected') {
    return {
      label: '已连接',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClass: 'bg-emerald-500',
    };
  }

  if (state === 'paired') {
    return {
      label: '已配对',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
      dotClass: 'bg-amber-500',
    };
  }

  if (state === 'checking') {
    return {
      label: '检测中',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
      dotClass: 'bg-amber-500',
    };
  }

  return {
    label: state === 'disconnected' ? '未连接' : '未配对',
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
  };
}

function articleIdentity(article: Pick<ArticlePreview, 'id' | 'url' | 'canonicalUrl'>) {
  return {
    id: article.id,
    url: article.url,
    canonicalUrl: article.canonicalUrl,
  };
}

function articleRecordFromExtractedArticle(article: ExtractedArticle): ArticleRecord {
  const now = new Date().toISOString();
  return {
    id: article.id,
    url: article.url,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    byline: article.byline,
    excerpt: article.excerpt,
    siteName: article.siteName,
    siteIconUrl: article.siteIconUrl,
    leadImageUrl: article.leadImageUrl,
    themeColor: article.themeColor,
    contentHtml: article.content,
    contentHash: article.contentHash,
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

function articleCardContent(pageState: PageState) {
  if (pageState.type === 'loading') {
    return {
      kicker: '当前页 · 正在检测',
      title: '正在检测正文',
      meta: '请稍候',
    };
  }

  if (pageState.type === 'unavailable') {
    return {
      kicker: '当前页 · 暂不可读',
      title: pageState.message,
      meta: '打开普通网页后使用阅读器',
    };
  }

  const { article } = pageState;
  return {
    kicker: '当前页 · 检测到正文',
    title: article.title || 'Untitled',
    meta: `${article.domain || '当前网站'} · 约 ${formatWordCount(article.wordCount)} 字 · ${article.readingMinutes} 分钟`,
  };
}

function unavailableTabMessage(tab: Awaited<ReturnType<typeof browser.tabs.query>>[number]) {
  if (!tab?.id) return '当前标签页无法访问';
  if (!tab.url) return '当前标签页地址为空';

  let url: URL;
  try {
    url = new URL(tab.url);
  } catch {
    return '当前标签页地址格式异常';
  }

  if (url.protocol === 'http:' || url.protocol === 'https:') return '';
  if (url.protocol === 'chrome-extension:') return '扩展页面由浏览器隔离';
  if (url.protocol === 'chrome:' || url.protocol === 'edge:' || url.protocol === 'about:') {
    return '浏览器内部页面由浏览器隔离';
  }
  return '当前页面类型由浏览器限制';
}

function formatWordCount(wordCount: number) {
  if (wordCount < 1000) return String(wordCount);
  return wordCount.toLocaleString('en-US');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
