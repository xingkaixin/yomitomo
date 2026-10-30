import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useTranslation } from 'react-i18next';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import {
  applyBilingualTranslation,
  clearBilingualTranslation,
  extractBilingualTranslationBlocks,
} from '@yomitomo/core';
import type { EbookArticleRecord } from '../bookcase/source-bookcase-types';
import {
  useSourceBilingualTranslation,
  type TranslationSurfaceAdapter,
} from '../bookcase/use-source-bilingual-translation';
import { ebookChapterForFoliateSection } from './ebook-content';
import {
  currentFoliateContent,
  currentFoliateContents,
  type FoliateViewElement,
} from './ebook-foliate-view';

type ActiveEbookTranslationSource = {
  doc: Document;
  sourceId: string;
};

type UseEbookBilingualTranslationInput = {
  article: EbookArticleRecord;
  style: string;
  targetLanguage?: string;
  onLayoutChange: () => void;
};

type EbookTranslationEffect = () => void | (() => void);

const translationEffectIds = new WeakMap<EbookTranslationEffect, number>();
let nextTranslationEffectId = 0;

function activeEbookTranslationSourceReducer(
  _source: ActiveEbookTranslationSource | null,
  event:
    | { type: 'documentAttached'; source: ActiveEbookTranslationSource }
    | { type: 'documentCleared' },
) {
  return event.type === 'documentAttached' ? event.source : null;
}

export function useEbookBilingualTranslation({
  article,
  style,
  targetLanguage,
  onLayoutChange,
}: UseEbookBilingualTranslationInput) {
  const { t } = useTranslation();
  const activeSourceRef = useRef<ActiveEbookTranslationSource | null>(null);
  const activeDocumentCleanupRef = useRef<() => void>(() => {});
  const [activeSource, dispatch] = useReducer(activeEbookTranslationSourceReducer, null);
  const supported = article.ebook.metadata.format === 'epub';
  const layoutChanged = useStableCallback(onLayoutChange);

  const detachFoliateDocument = useCallback(() => {
    activeDocumentCleanupRef.current();
    activeDocumentCleanupRef.current = () => {};
    activeSourceRef.current = null;
  }, []);

  const translationSurface =
    useMemo<TranslationSurfaceAdapter<EbookTranslationEffect> | null>(() => {
      if (!supported || !activeSource) return null;
      const { doc, sourceId } = activeSource;
      return {
        sourceId,
        applyTranslation: (translation, visible) => () =>
          runWhenEbookSelectionSettles(doc, () => {
            const changed = visible
              ? applyBilingualTranslation(doc.body, translation, {
                  retryLabel: t('readerTranslation.common.retryTranslationSegment'),
                  style,
                })
              : clearBilingualTranslation(doc.body);
            if (!changed) return;
            doc.defaultView?.requestAnimationFrame?.(() => layoutChanged());
          }),
        extractBlocks: () =>
          extractBilingualTranslationBlocks(doc.body).map(({ id, text }) => ({ id, text })),
        scrollToBlock: (blockId) => scrollEbookTranslationBlockIntoView(doc, blockId),
      };
    }, [activeSource, style, supported, t]);

  const session = useSourceBilingualTranslation({
    articleId: article.id,
    contentKind: 'chapter',
    surface: translationSurface,
    targetLanguage,
  });
  const { retryBlock, surfaceOutput } = session;
  const readSurfaceOutput = useStableCallback(() => surfaceOutput);

  const attachFoliateDocument = useCallback(
    (view: FoliateViewElement | null) => {
      if (!supported || !view) return;
      const nextSource = ebookTranslationSourceForView(article, view);
      if (!nextSource) return;
      const current = activeSourceRef.current;
      if (current?.doc === nextSource.doc && current.sourceId === nextSource.sourceId) return;

      detachFoliateDocument();
      activeSourceRef.current = nextSource;
      dispatch({ type: 'documentAttached', source: nextSource });
      const handleClick = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        const retryButton = target?.closest<HTMLElement>(
          '[data-reader-translation-action="failed"]',
        );
        if (!retryButton) return;
        const sourceBlockId = retryButton.dataset.readerTranslationBlockId;
        if (!sourceBlockId) return;
        event.preventDefault();
        event.stopPropagation();
        retryBlock(sourceBlockId);
      };
      nextSource.doc.addEventListener('click', handleClick);
      activeDocumentCleanupRef.current = () =>
        nextSource.doc.removeEventListener('click', handleClick);
    },
    [article, detachFoliateDocument, retryBlock, supported],
  );

  const cleanupFoliateDocument = useCallback(() => {
    detachFoliateDocument();
    dispatch({ type: 'documentCleared' });
  }, [detachFoliateDocument]);

  const applySurfaceOutput = useCallback((marker: HTMLElement | null) => {
    if (marker) return readSurfaceOutput()?.() ?? undefined;
  }, []);

  useMountEffect(() => detachFoliateDocument);

  return {
    attachFoliateDocument,
    cleanupFoliateDocument,
    dialog: session.dialog,
    marker: surfaceOutput ? (
      <span hidden key={translationEffectId(surfaceOutput)} ref={applySurfaceOutput} />
    ) : null,
    toolbar: session.toolbar,
  };
}

function translationEffectId(effect: EbookTranslationEffect) {
  let id = translationEffectIds.get(effect);
  if (id === undefined) {
    nextTranslationEffectId += 1;
    id = nextTranslationEffectId;
    translationEffectIds.set(effect, id);
  }
  return id;
}

export function ebookTranslationSourceForView(
  article: EbookArticleRecord,
  view: FoliateViewElement,
): ActiveEbookTranslationSource | null {
  const pageInfo = view.getPageInfo?.();
  const currentContent = currentFoliateContent(view);
  const sectionIndex = pageInfo?.sectionIndex ?? currentContent?.index;
  if (sectionIndex === undefined) return null;
  const content =
    currentFoliateContents(view).find((candidate) => candidate.index === sectionIndex) ??
    currentContent;
  const doc = content?.doc;
  const chapter = ebookChapterForFoliateSection(article, view, sectionIndex);
  if (!doc?.body || !chapter) return null;
  return {
    doc,
    sourceId: chapter.id,
  };
}

export function runWhenEbookSelectionSettles(doc: Document, mutation: () => void) {
  let active = true;
  const run = () => {
    if (!active) return;
    const selection = doc.getSelection();
    if (selection && !selection.isCollapsed) return;
    active = false;
    doc.removeEventListener('selectionchange', run);
    mutation();
  };
  doc.addEventListener('selectionchange', run);
  run();
  return () => {
    active = false;
    doc.removeEventListener('selectionchange', run);
  };
}

function scrollEbookTranslationBlockIntoView(doc: Document, blockId: string) {
  const target = translationBlockElement(
    doc,
    '[data-reader-translation-block-id]',
    'data-reader-translation-block-id',
    blockId,
  );
  const source = translationBlockElement(
    doc,
    '[data-reader-source-block-id]',
    'data-reader-source-block-id',
    blockId,
  );
  const element = target || source;
  element?.scrollIntoView?.({ block: 'center' });
  if (target instanceof HTMLButtonElement) target.focus();
}

function translationBlockElement(
  doc: Document,
  selector: string,
  attribute: string,
  blockId: string,
) {
  return Array.from(doc.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.getAttribute(attribute) === blockId,
  );
}
