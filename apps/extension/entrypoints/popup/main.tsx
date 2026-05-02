import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, MessageSquareText } from "lucide-react";
import { browser } from "wxt/browser";
import { Button } from "../../src/components/ui/button";
import "../../src/styles.css";

function Popup() {
  const [status, setStatus] = useState("准备进入阅读器模式");

  async function toggleReader() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    try {
      await browser.tabs.sendMessage(tab.id, { type: "reader:toggle" });
      setStatus("已发送到当前网页");
      window.close();
    } catch {
      setStatus("当前页面暂时无法注入插件，请换到普通网页后重试");
    }
  }

  return (
    <main className="w-80 p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <BookOpen className="size-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold">Reader Agent</h1>
          <p className="text-xs text-muted-foreground">阅读器、高亮、批注讨论</p>
        </div>
      </div>
      <Button className="w-full" onClick={toggleReader}>
        <MessageSquareText className="size-4" />
        进入阅读器模式
      </Button>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{status}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
