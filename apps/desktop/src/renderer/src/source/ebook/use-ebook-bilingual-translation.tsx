import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  articleId: string;
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

export function useEbookBilingualTranslation({
  article,
  style,
  targetLanguage,
  onLayoutChange,
}: UseEbookBilingualTranslationInput) {
  const { t } = useTranslation();
  const activeSourceRef = useRef<ActiveEbookTranslationSource | null>(null);
  const activeDocumentCleanupRef = useRef<() => void>(() => {});
  const retryBlockRef = useRef<(blockId: string) => void>(() => {});
  const [activeSource, setActiveSource] = useState<ActiveEbookTranslationSource | null>(null);
  const supported = article.ebook.metadata.format === 'epub';

  const detachFoliateDocument = useCallback(() => {
    activeDocumentCleanupRef.current();
    activeDocumentCleanupRef.current = () => {};
    activeSourceRef.current = null;
  }, []);

  const translationSurface =
    useMemo<TranslationSurfaceAdapter<EbookTranslationEffect> | null>(() => {
      if (!supported || !activeSource || activeSource.articleId !== article.id) return null;
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
            doc.defaultView?.requestAnimationFrame?.(() => onLayoutChange());
          }),
        extractBlocks: () =>
          extractBilingualTranslationBlocks(doc.body).map(({ id, text }) => ({ id, text })),
        scrollToBlock: (blockId) => scrollEbookTranslationBlockIntoView(doc, blockId),
      };
    }, [activeSource, article.id, onLayoutChange, style, supported, t]);

  const session = useSourceBilingualTranslation({
    articleId: article.id,
    contentKind: 'chapter',
    surface: translationSurface,
    targetLanguage,
  });
  retryBlockRef.current = session.retryBlock;

  const attachFoliateDocument = useCallback(
    (view: FoliateViewElement | null) => {
      if (!supported || !view) return;
      const source = ebookTranslationSourceForView(article, view);
      if (!source) return;
      const nextSource = { ...source, articleId: article.id };
      const current = activeSourceRef.current;
      if (
        current?.articleId === nextSource.articleId &&
        current.doc === nextSource.doc &&
        current.sourceId === nextSource.sourceId
      ) {
        return;
      }

      detachFoliateDocument();
      activeSourceRef.current = nextSource;
      setActiveSource(nextSource);
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
        retryBlockRef.current(sourceBlockId);
      };
      nextSource.doc.addEventListener('click', handleClick);
      activeDocumentCleanupRef.current = () =>
        nextSource.doc.removeEventListener('click', handleClick);
    },
    [article, detachFoliateDocument, supported],
  );

  const cleanupFoliateDocument = useCallback(() => {
    detachFoliateDocument();
    setActiveSource(null);
  }, [detachFoliateDocument]);

  useEffect(() => {
    const current = activeSourceRef.current;
    if (!current || current.articleId === article.id) return;
    cleanupFoliateDocument();
  }, [article.id, cleanupFoliateDocument]);

  useEffect(() => session.surfaceOutput?.(), [session.surfaceOutput]);

  useEffect(() => detachFoliateDocument, [detachFoliateDocument]);

  return {
    attachFoliateDocument,
    cleanupFoliateDocument,
    dialog: session.dialog,
    toolbar: session.toolbar,
  };
}

export function ebookTranslationSourceForView(
  article: EbookArticleRecord,
  view: FoliateViewElement,
): Omit<ActiveEbookTranslationSource, 'articleId'> | null {
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
