import React, { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from './components/ui/button';
import { DESKTOP_PAIRING_TOKEN_KEY } from './desktop-bridge';
import { readExtensionStorage } from './extension-runtime';
import { toggleReaderInTab } from './popup-actions';

export function Popup() {
  const [status, setStatus] = useState('准备进入阅读器模式');
  const [paired, setPaired] = useState(false);

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

  async function toggleReader() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    try {
      setStatus('正在打开阅读器…');
      await toggleReaderInTab(tab.id);
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
      <Button className="h-11 w-full rounded-2xl shadow-sm" onClick={toggleReader}>
        <MessageSquareText className="size-4" />
        进入阅读器模式
      </Button>
      <p aria-live="polite" className="mt-3 text-xs leading-5 text-muted-foreground" role="status">
        {status}
      </p>
    </main>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
