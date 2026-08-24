import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { isContinuousTextSelectionMouseEvent } from '../bookcase/source-reader-selection-events';
import {
  readerPageTurnDirectionFromKeyboardEvent,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';
import {
  ebookClickPagingDirectionAtClientX,
  type EbookClickPagingDirection,
} from './app-source-bookcase-ebook-utils';
import { debugEbookLayout, debugEbookRect } from './ebook-layout-debug';
import { currentFoliateContents, type FoliateViewElement } from './ebook-foliate-view';

type UseFoliateInputBridgeInput = {
  canvasRef: RefObject<HTMLDivElement | null>;
  readerStateStatus: 'loading' | 'ready' | 'error';
  viewRef: RefObject<FoliateViewElement | null>;
  onFoliateClick: (event: MouseEvent, doc: Document) => boolean | void;
  onFoliatePageTurnClick: (direction: EbookClickPagingDirection) => void;
  onFoliatePageTurnKey: (direction: ReaderPageTurnDirection) => void;
  onFoliatePointerDown: () => void;
  onFoliateSelection: (doc: Document) => void;
  onFoliateSelectionShortcut: (event: KeyboardEvent) => void;
};

export function useFoliateInputBridge({
  canvasRef,
  readerStateStatus,
  viewRef,
  onFoliateClick,
  onFoliatePageTurnClick,
  onFoliatePageTurnKey,
  onFoliatePointerDown,
  onFoliateSelection,
  onFoliateSelectionShortcut,
}: UseFoliateInputBridgeInput) {
  const observedViewsRef = useRef(new WeakSet<FoliateViewElement>());
  const observedDocumentsRef = useRef(new WeakSet<Document>());
  const suppressedSelectionDocumentsRef = useRef(new WeakSet<Document>());
  const listenerCleanupsRef = useRef<Array<() => void>>([]);
  const selectionTimersRef = useRef(new Set<number>());
  const onFoliateClickRef = useRef(onFoliateClick);
  const onFoliatePageTurnClickRef = useRef(onFoliatePageTurnClick);
  const onFoliatePageTurnKeyRef = useRef(onFoliatePageTurnKey);
  const onFoliatePointerDownRef = useRef(onFoliatePointerDown);
  const onFoliateSelectionRef = useRef(onFoliateSelection);
  const onFoliateSelectionShortcutRef = useRef(onFoliateSelectionShortcut);

  onFoliateClickRef.current = onFoliateClick;
  onFoliatePageTurnClickRef.current = onFoliatePageTurnClick;
  onFoliatePageTurnKeyRef.current = onFoliatePageTurnKey;
  onFoliatePointerDownRef.current = onFoliatePointerDown;
  onFoliateSelectionRef.current = onFoliateSelection;
  onFoliateSelectionShortcutRef.current = onFoliateSelectionShortcut;

  const setClickPagingHoverDirection = useCallback(
    (direction: EbookClickPagingDirection | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (direction) canvas.dataset.ebookClickPagingHover = direction;
      else delete canvas.dataset.ebookClickPagingHover;
    },
    [canvasRef],
  );

  const cleanupFoliateDocumentListeners = useCallback(() => {
    for (const cleanup of listenerCleanupsRef.current) cleanup();
    listenerCleanupsRef.current = [];
    for (const timer of selectionTimersRef.current) window.clearTimeout(timer);
    selectionTimersRef.current.clear();
    observedViewsRef.current = new WeakSet<FoliateViewElement>();
    observedDocumentsRef.current = new WeakSet<Document>();
    suppressedSelectionDocumentsRef.current = new WeakSet<Document>();
    const canvas = canvasRef.current;
    if (canvas) delete canvas.dataset.ebookClickPagingHover;
  }, [canvasRef]);

  const foliateDocumentHasExpandedSelection = useCallback((doc: Document) => {
    const selection = doc.getSelection();
    return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
  }, []);

  const foliateViewHasExpandedSelection = useCallback(
    (view: FoliateViewElement | null) =>
      currentFoliateContents(view).some(({ doc }) =>
        doc ? foliateDocumentHasExpandedSelection(doc) : false,
      ),
    [foliateDocumentHasExpandedSelection],
  );

  const foliateViewClickPagingDirection = useCallback(
    (event: MouseEvent, view: FoliateViewElement) => {
      const viewRect = view.getBoundingClientRect();
      const direction = ebookClickPagingDirectionAtClientX({
        clientX: event.clientX,
        rect: viewRect,
      });
      debugEbookLayout('click-paging-view-direction', {
        canvas: debugEbookRect(canvasRef.current?.getBoundingClientRect()),
        clientX: Math.round(event.clientX),
        direction,
        eventType: event.type,
        view: debugEbookRect(viewRect),
      });
      return direction;
    },
    [canvasRef],
  );

  const foliateClickPagingDirection = useCallback(
    (event: MouseEvent, doc: Document) => {
      const frame = doc.defaultView?.frameElement;
      if (!(frame instanceof HTMLIFrameElement)) return null;
      const frameRect = frame.getBoundingClientRect();
      const viewRect = viewRef.current?.getBoundingClientRect() ?? null;
      const hitRect = viewRect && viewRect.width > 0 ? viewRect : frameRect;
      const clientX = frameRect.left + event.clientX;
      const direction = ebookClickPagingDirectionAtClientX({ clientX, rect: hitRect });
      debugEbookLayout('click-paging-direction', {
        canvas: debugEbookRect(canvasRef.current?.getBoundingClientRect()),
        clientX: Math.round(clientX),
        direction,
        eventClientX: Math.round(event.clientX),
        eventType: event.type,
        frame: debugEbookRect(frameRect),
        hitRect: debugEbookRect(hitRect),
        view: debugEbookRect(viewRect),
      });
      return direction;
    },
    [canvasRef, viewRef],
  );

  const attachFoliateViewListeners = useCallback(
    (view: FoliateViewElement | null) => {
      if (!view || observedViewsRef.current.has(view)) return;
      observedViewsRef.current.add(view);

      const handleClick = (event: MouseEvent) => {
        if (event.button !== 0 || event.defaultPrevented) return;
        if (foliateViewHasExpandedSelection(view)) return;
        if (foliateClickTargetIsInteractive(event.target)) return;
        const direction = foliateViewClickPagingDirection(event, view);
        if (direction) onFoliatePageTurnClickRef.current(direction);
      };
      const handleMouseMove = (event: MouseEvent) => {
        if (foliateViewHasExpandedSelection(view)) {
          setClickPagingHoverDirection(null);
          return;
        }
        setClickPagingHoverDirection(foliateViewClickPagingDirection(event, view));
      };
      const handleMouseLeave = () => setClickPagingHoverDirection(null);
      const handlePointerDown = () => onFoliatePointerDownRef.current();

      view.addEventListener('click', handleClick);
      view.addEventListener('mousemove', handleMouseMove);
      view.addEventListener('mouseleave', handleMouseLeave);
      view.addEventListener('pointerdown', handlePointerDown, true);
      listenerCleanupsRef.current.push(() => {
        view.removeEventListener('click', handleClick);
        view.removeEventListener('mousemove', handleMouseMove);
        view.removeEventListener('mouseleave', handleMouseLeave);
        view.removeEventListener('pointerdown', handlePointerDown, true);
      });
    },
    [
      foliateViewClickPagingDirection,
      foliateViewHasExpandedSelection,
      setClickPagingHoverDirection,
    ],
  );

  const attachFoliateDocumentListeners = useCallback(
    (view: FoliateViewElement | null) => {
      attachFoliateViewListeners(view);
      for (const { doc } of currentFoliateContents(view)) {
        if (!doc || observedDocumentsRef.current.has(doc)) continue;
        observedDocumentsRef.current.add(doc);

        const handleSelection = () => {
          const timer = window.setTimeout(() => {
            selectionTimersRef.current.delete(timer);
            if (suppressedSelectionDocumentsRef.current.delete(doc)) {
              doc.getSelection()?.removeAllRanges();
              return;
            }
            const selection = doc.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
            onFoliateSelectionRef.current(doc);
          }, 0);
          selectionTimersRef.current.add(timer);
        };
        const handleMouseDown = (event: MouseEvent) => {
          if (!isContinuousTextSelectionMouseEvent(event)) {
            suppressedSelectionDocumentsRef.current.delete(doc);
            return;
          }
          if (foliateClickTargetIsInteractive(event.target)) return;
          event.preventDefault();
          suppressedSelectionDocumentsRef.current.add(doc);
          doc.getSelection()?.removeAllRanges();
        };
        const handleClick = (event: MouseEvent) => {
          if (event.button !== 0 || event.defaultPrevented) return;
          if (foliateDocumentHasExpandedSelection(doc)) return;
          if (onFoliateClickRef.current(event, doc)) return;
          if (foliateClickTargetIsInteractive(event.target)) return;
          const direction = foliateClickPagingDirection(event, doc);
          if (direction) onFoliatePageTurnClickRef.current(direction);
        };
        const handleMouseMove = (event: MouseEvent) => {
          if (foliateDocumentHasExpandedSelection(doc)) {
            setClickPagingHoverDirection(null);
            return;
          }
          setClickPagingHoverDirection(foliateClickPagingDirection(event, doc));
        };
        const handleMouseLeave = () => setClickPagingHoverDirection(null);
        const handlePointerDown = () => onFoliatePointerDownRef.current();
        const handleKeyDown = (event: KeyboardEvent) => {
          onFoliateSelectionShortcutRef.current(event);
          const direction = readerPageTurnDirectionFromKeyboardEvent(event);
          if (!direction) return;
          event.preventDefault();
          onFoliatePageTurnKeyRef.current(direction);
        };

        doc.addEventListener('mousedown', handleMouseDown, true);
        doc.addEventListener('mouseup', handleSelection);
        doc.addEventListener('click', handleClick);
        doc.addEventListener('keyup', handleSelection);
        doc.addEventListener('keydown', handleKeyDown);
        doc.addEventListener('mousemove', handleMouseMove);
        doc.addEventListener('mouseleave', handleMouseLeave);
        doc.addEventListener('pointerdown', handlePointerDown, true);
        listenerCleanupsRef.current.push(() => {
          doc.removeEventListener('mousedown', handleMouseDown, true);
          doc.removeEventListener('mouseup', handleSelection);
          doc.removeEventListener('click', handleClick);
          doc.removeEventListener('keyup', handleSelection);
          doc.removeEventListener('keydown', handleKeyDown);
          doc.removeEventListener('mousemove', handleMouseMove);
          doc.removeEventListener('mouseleave', handleMouseLeave);
          doc.removeEventListener('pointerdown', handlePointerDown, true);
        });
      }
    },
    [
      attachFoliateViewListeners,
      foliateClickPagingDirection,
      foliateDocumentHasExpandedSelection,
      setClickPagingHoverDirection,
    ],
  );

  useLayoutEffect(() => {
    attachFoliateDocumentListeners(viewRef.current);
  }, [attachFoliateDocumentListeners, readerStateStatus, viewRef]);

  useLayoutEffect(() => {
    if (readerStateStatus !== 'ready') setClickPagingHoverDirection(null);
  }, [readerStateStatus, setClickPagingHoverDirection]);

  useEffect(() => cleanupFoliateDocumentListeners, [cleanupFoliateDocumentListeners]);

  return { attachFoliateDocumentListeners, cleanupFoliateDocumentListeners };
}

function foliateClickTargetIsInteractive(target: EventTarget | null) {
  if (!target || !('closest' in target)) return false;
  const closest = (target as { closest?: (selector: string) => Element | null }).closest;
  if (typeof closest !== 'function') return false;
  return Boolean(
    closest.call(
      target,
      'a, button, input, textarea, select, summary, audio, video, [role="button"], [contenteditable=""], [contenteditable="true"]',
    ),
  );
}
