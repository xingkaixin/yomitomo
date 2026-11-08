import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowExpand01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEventListener } from '@yomitomo/reader-ui/use-event-listener';
import { getDesktopApi } from './app-desktop-api';
import { readerPageTurnDirectionFromKey } from './use-reader-page-turn-keys';

export type WeReadReaderMode = 'full' | 'compact';

// 阅读器状态放在阅读库这一层：离开书页再回来，同一本书的阅读器保持原来的形态。
export type WeReadReaderState = {
  bookId: string;
  mode: WeReadReaderMode;
  noteKey: string | null;
} | null;

export type WeReadReaderEvent =
  | { type: 'readerOpened'; bookId: string; mode: WeReadReaderMode; noteKey: string | null }
  | { type: 'readerCompacted' }
  | { type: 'readerExpanded' }
  | { type: 'readerClosed' };

export function weReadReaderState(
  state: WeReadReaderState,
  event: WeReadReaderEvent,
): WeReadReaderState {
  switch (event.type) {
    case 'readerOpened':
      return {
        bookId: event.bookId,
        mode: state?.bookId === event.bookId ? state.mode : event.mode,
        noteKey: event.noteKey,
      };
    case 'readerCompacted':
      return state && { ...state, mode: 'compact' };
    case 'readerExpanded':
      return state && { ...state, mode: 'full' };
    case 'readerClosed':
      return null;
  }
}

export function closeWeReadReader() {
  void getDesktopApi().weRead.closeReader();
}

export function WeReadReaderFull() {
  const trackBounds = useReaderBounds(false);
  return <div className="weread-reader-full" ref={trackBounds} />;
}

export function WeReadReaderCompact({
  onClose,
  onExpand,
}: {
  onClose: () => void;
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const trackBounds = useReaderBounds(true);
  useEventListener(window, 'keydown', turnReaderPageFromKey);
  return (
    <div
      className="weread-reader-compact"
      role="region"
      aria-label={t('wereadBook.weReadFallback')}
    >
      <header onPointerDown={startCompactDrag}>
        <span>{t('wereadBook.weReadFallback')}</span>
        <button
          type="button"
          aria-label={t('wereadBook.readerExpand')}
          title={t('wereadBook.readerExpand')}
          onClick={onExpand}
        >
          <HugeiconsIcon icon={ArrowExpand01Icon} size={14} />
        </button>
        <button
          type="button"
          aria-label={t('wereadBook.readerClose')}
          title={t('wereadBook.readerClose')}
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      </header>
      <div className="weread-reader-compact-view" ref={trackBounds} />
    </div>
  );
}

// 划线行和章节都是按钮，点过之后焦点停在按钮上；按钮不用左右键，这里仍交给小窗翻页。
function turnReaderPageFromKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]',
    )
  ) {
    return;
  }
  const direction = readerPageTurnDirectionFromKey(event.key);
  if (!direction) return;
  event.preventDefault();
  void getDesktopApi().weRead.turnReaderPage(direction);
}

const COMPACT_DRAG_MARGIN = 16;

// 拖动直接改 DOM 并同步原生视图，不经过 React 状态：每帧重渲染会让视图跟手变慢。
// 小窗只在划线列表区域内移动，不盖住书页 header 和左侧目录。
function startCompactDrag(event: React.PointerEvent<HTMLElement>) {
  if (event.button !== 0 || (event.target as Element).closest('button')) return;
  const header = event.currentTarget;
  const frame = header.parentElement;
  const container = frame?.parentElement?.querySelector('.weread-note-list');
  const view = frame?.querySelector<HTMLElement>('.weread-reader-compact-view');
  if (!frame || !container || !view) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const originX = Number(frame.dataset.offsetX ?? 0);
  const originY = Number(frame.dataset.offsetY ?? 0);
  const frameRect = frame.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const minX = originX + containerRect.left + COMPACT_DRAG_MARGIN - frameRect.left;
  const maxX = originX + containerRect.right - COMPACT_DRAG_MARGIN - frameRect.right;
  const minY = originY + containerRect.top + COMPACT_DRAG_MARGIN - frameRect.top;
  const maxY = originY + containerRect.bottom - COMPACT_DRAG_MARGIN - frameRect.bottom;
  const move = (moveEvent: PointerEvent) => {
    const x = clamp(originX + moveEvent.clientX - startX, minX, maxX);
    const y = clamp(originY + moveEvent.clientY - startY, minY, maxY);
    frame.dataset.offsetX = String(x);
    frame.dataset.offsetY = String(y);
    frame.style.translate = `${x}px ${y}px`;
    sendReaderBounds(view, true);
  };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
  // 监听挂在 window 上而不是靠指针捕获：指针扫过原生视图时捕获会丢，拖动会中途停住。
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sendReaderBounds(element: HTMLElement, compact: boolean) {
  const rect = element.getBoundingClientRect();
  void getDesktopApi().weRead.setReaderBounds({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    compact,
  });
}

// 微信读书页面是主进程挂在窗口上的原生视图，不在 DOM 里；这里把占位区域的位置同步给它。
function useReaderBounds(compact: boolean) {
  return useMemo(
    () => (element: HTMLElement | null) => {
      if (!element) return;
      const send = () => sendReaderBounds(element, compact);
      const observer = new ResizeObserver(send);
      observer.observe(element);
      window.addEventListener('resize', send);
      // 进入书页时外层有滑入动画；位置变了但尺寸不变，ResizeObserver 不会触发，动画结束后要再同步一次。
      window.addEventListener('animationend', send);
      window.addEventListener('transitionend', send);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', send);
        window.removeEventListener('animationend', send);
        window.removeEventListener('transitionend', send);
        void getDesktopApi().weRead.setReaderBounds(null);
      };
    },
    [compact],
  );
}
