import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MessageSquareText } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '../../src/components/ui/button';
import '../../src/styles.css';

function Popup() {
  const [status, setStatus] = useState('准备进入阅读器模式');

  async function toggleReader() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'yomitomo:toggle' });
      setStatus('已发送到当前网页');
      window.close();
    } catch {
      setStatus('当前页面暂时无法注入插件，请换到普通网页后重试');
    }
  }

  return (
    <main className="w-80 bg-background p-4">
      <div className="mb-4 flex items-center gap-3">
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
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{status}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
