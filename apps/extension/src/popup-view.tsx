import React, { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { browser } from 'wxt/browser';
import type { ArticlePreview } from './article-extraction';
import { Button } from './components/ui/button';
import { DESKTOP_PAIRING_TOKEN_KEY } from './desktop-bridge';
import { readExtensionStorage } from './extension-runtime';
import { getArticlePreviewInTab, toggleReaderInTab } from './popup-actions';

type PageState =
  | { type: 'loading' }
  | { type: 'readable'; tabId: number; article: ArticlePreview }
  | { type: 'unavailable'; message: string };

export function Popup() {
  const [status, setStatus] = useState('准备进入阅读器模式');
  const [paired, setPaired] = useState(false);
  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });

  useEffect(() => {
    let active = true;
    readExtensionStorage([DESKTOP_PAIRING_TOKEN_KEY])
      .then((stored) => {
        if (!active) return;
        const token = stored?.[DESKTOP_PAIRING_TOKEN_KEY];
        setPaired(typeof token === 'string' && token.trim().length > 0);
      })
      .catch(() => {
        if (active) setPaired(false);
      });

    return () => {
      active = false;
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

  const pairingLabel = paired ? '已配对' : '未配对';
  const pairingBadgeClass = paired
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-red-200 bg-red-50 text-red-700';
  const pairingDotClass = paired ? 'bg-emerald-500' : 'bg-red-500';
  const readerDisabled = pageState.type !== 'readable';
  const articleCard = articleCardContent(pageState);

  return (
    <main className="relative w-80 bg-background p-4">
      <div
        aria-label={`配对状态：${pairingLabel}`}
        className={`absolute right-4 top-4 inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold shadow-sm ${pairingBadgeClass}`}
      >
        <span className={`size-2 rounded-full ${pairingDotClass}`} />
        {pairingLabel}
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
