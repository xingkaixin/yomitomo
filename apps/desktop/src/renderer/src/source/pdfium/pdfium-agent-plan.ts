import type { PdfPageGeometry } from '@embedpdf/models';
import i18next from 'i18next';
import {
  createPdfTextAnchor,
  createTextAnchor,
  isPdfTextAnchor,
  resolveTextAnchor,
  type AgentReadingPlanItem,
  type Annotation,
  type ArticleRecord,
} from '@yomitomo/shared';
import type { PromptArticle } from '../../shell/app-reading-types';
import type { SourceAgentAnnotationRequestOptions } from '../bookcase/app-source-agent-request';
import { promptArticle } from '../bookcase/source-prompt-article';
import { pdfiumRectsForTextRange, type PdfPageGeometryEntry } from './pdfium-geometry';
import type { PdfPageTextIndex, PdfTextDocument } from './pdfium-text-document';

type PdfiumPlanPage = {
  size: {
    height: number;
    width: number;
  };
};

type PdfiumPlanDocument = {
  pages: PdfiumPlanPage[];
};

export function pdfiumPromptArticle(
  article: ArticleRecord,
  anchor: Annotation['anchor'] | undefined,
  pageText: string,
): PromptArticle {
  const articleContext = promptArticle(article, pageText);
  const pageLabel =
    anchor && isPdfTextAnchor(anchor)
      ? `${i18next.t('pdfReader.pageLabel', { page: anchor.pageIndex + 1 })}\n`
      : '';
  return {
    ...articleContext,
    text: `${pageLabel}${pageText}`,
  };
}

export function constrainPdfiumAgentPlanAnnotation(
  annotation: Annotation,
  readingPlan: AgentReadingPlanItem[] | undefined,
  articleText: string,
) {
  if (!readingPlan?.length) return annotation;

  const scopedAnchor = resolvePdfiumAgentPlanAnchor(annotation, readingPlan, articleText);
  if (!scopedAnchor) return null;
  const { planItem, position } = scopedAnchor;
  const scopedAnnotation = {
    ...annotation,
    anchor: createTextAnchor(articleText, position.start, position.end),
  };
  if (!planItem) return null;
  if (!planItem.readingIntent) return scopedAnnotation;
  if (annotation.readingIntent === planItem.readingIntent) return scopedAnnotation;

  return {
    ...scopedAnnotation,
    readingIntent: planItem.readingIntent,
    comments: annotation.comments.map((comment) => ({
      ...comment,
      readingIntent: comment.readingIntent || planItem.readingIntent,
    })),
  };
}

export function resolvePdfiumAgentPlanAnchor(
  annotation: Annotation,
  readingPlan: AgentReadingPlanItem[],
  articleText: string,
) {
  const orderedPlan = readingPlan.toSorted((left, right) => left.sectionStart - right.sectionStart);
  for (const planItem of orderedPlan) {
    const sectionText = articleText.slice(planItem.sectionStart, planItem.sectionEnd);
    const localRange = resolvePdfiumAnchorInSection(annotation.anchor, sectionText, planItem);
    if (!localRange) continue;
    return {
      planItem,
      position: {
        start: planItem.sectionStart + localRange.start,
        end: planItem.sectionStart + localRange.end,
      },
    };
  }
  return null;
}

export function resolvePdfiumAnchorInSection(
  anchor: Annotation['anchor'],
  sectionText: string,
  planItem: AgentReadingPlanItem,
) {
  const candidates = [anchor.start - planItem.sectionStart, anchor.start, 0];
  for (const start of candidates) {
    const safeStart = Math.max(0, Math.min(start, Math.max(0, sectionText.length - 1)));
    const safeEnd = Math.max(
      safeStart,
      Math.min(safeStart + anchor.exact.length, sectionText.length),
    );
    const resolved = resolveTextAnchor(sectionText, {
      ...anchor,
      start: safeStart,
      end: safeEnd,
    });
    if (resolved) return resolved;
  }
  return null;
}

export function pdfiumAnchorForReadingPlanStart(
  readingPlan: AgentReadingPlanItem[],
  textDocument: PdfTextDocument,
  pageGeometryByIndex: Map<number, PdfPageGeometryEntry>,
) {
  const firstItem = readingPlan.toSorted(
    (left, right) => left.sectionStart - right.sectionStart,
  )[0];
  if (!firstItem) return undefined;
  const page = textDocument.pages.find(
    (item) => item.bodyStart <= firstItem.sectionStart && item.bodyEnd > firstItem.sectionStart,
  );
  if (!page) return undefined;
  const geometryEntry = pageGeometryByIndex.get(page.pageIndex);
  if (!geometryEntry) return undefined;
  const range = pdfiumReadingPlanStartRange(firstItem, page);
  const rects = pdfiumRectsForTextRange(
    geometryEntry.geometry,
    range.start,
    range.end,
    geometryEntry.width,
    geometryEntry.height,
  );
  return createPdfTextAnchor({
    pageText: page.pageText,
    pageIndex: page.pageIndex,
    start: range.start,
    end: range.end,
    pageWidth: geometryEntry.width,
    pageHeight: geometryEntry.height,
    rects,
  });
}

export async function pdfiumPageGeometriesForReadingPlan(
  document: PdfiumPlanDocument,
  textDocument: PdfTextDocument,
  readingPlan: AgentReadingPlanItem[],
  getPageGeometry: (
    document: PdfiumPlanDocument,
    page: PdfiumPlanPage,
  ) => Promise<PdfPageGeometry | null>,
) {
  const pageIndexes = new Set<number>();
  for (const item of readingPlan) {
    for (const page of textDocument.pages) {
      if (page.bodyEnd <= item.sectionStart || page.bodyStart >= item.sectionEnd) continue;
      pageIndexes.add(page.pageIndex);
    }
  }

  const entries = await Promise.all(
    Array.from(pageIndexes).map(async (pageIndex) => {
      const page = document.pages[pageIndex];
      if (!page) return null;
      const geometry = await getPageGeometry(document, page);
      if (!geometry) return null;
      return [pageIndex, { geometry, width: page.size.width, height: page.size.height }] as const;
    }),
  );
  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}

export function pdfiumReadingPlanStartRange(item: AgentReadingPlanItem, page: PdfPageTextIndex) {
  if (page.pageText.length === 0) return { start: 0, end: 0 };
  const sectionStart = Math.max(0, item.sectionStart - page.bodyStart);
  const sectionEnd = Math.max(
    sectionStart + 1,
    Math.min(item.sectionEnd - page.bodyStart, page.pageText.length),
  );
  const text = page.pageText.slice(sectionStart, sectionEnd);
  const firstTextOffset = text.search(/\S/);
  const start = Math.min(
    page.pageText.length - 1,
    sectionStart + (firstTextOffset >= 0 ? firstTextOffset : 0),
  );
  const end = Math.min(page.pageText.length, Math.max(start + 1, start + 24));
  return { start, end };
}

export function pdfiumAgentAnnotationRequestOptions(
  options: SourceAgentAnnotationRequestOptions,
): SourceAgentAnnotationRequestOptions {
  return options.readingPlan?.length && !options.targetAnchor
    ? {
        ...options,
        readingPlan: options.readingPlan.toSorted(
          (left, right) => left.sectionStart - right.sectionStart,
        ),
      }
    : options;
}

export function pdfiumMapReadingPlanAgentAnnotation(
  annotation: Annotation,
  readingPlan: AgentReadingPlanItem[],
  textDocument: PdfTextDocument,
  pageGeometryByIndex: Map<number, PdfPageGeometryEntry>,
) {
  const constrainedAnnotation = constrainPdfiumAgentPlanAnnotation(
    annotation,
    readingPlan,
    textDocument.text,
  );
  if (!constrainedAnnotation) return null;
  return pdfiumAnnotationFromGlobalAgentAnnotation(
    constrainedAnnotation,
    textDocument,
    pageGeometryByIndex,
  );
}

export function pdfiumAnnotationFromGlobalAgentAnnotation(
  annotation: Annotation,
  textDocument: PdfTextDocument,
  pageGeometryByIndex: Map<number, PdfPageGeometryEntry>,
): Annotation | null {
  const range = resolveTextAnchor(textDocument.text, annotation.anchor);
  if (!range) return null;
  const page = textDocument.pages.find(
    (item) => range.start >= item.bodyStart && range.end <= item.bodyEnd,
  );
  if (!page) return null;
  const geometryEntry = pageGeometryByIndex.get(page.pageIndex);
  if (!geometryEntry) return null;
  const pageStart = range.start - page.bodyStart;
  const pageEnd = range.end - page.bodyStart;
  const rects = pdfiumRectsForTextRange(
    geometryEntry.geometry,
    pageStart,
    pageEnd,
    geometryEntry.width,
    geometryEntry.height,
  );
  if (rects.length === 0) return null;
  return {
    ...annotation,
    anchor: createPdfTextAnchor({
      pageText: page.pageText,
      pageIndex: page.pageIndex,
      start: pageStart,
      end: pageEnd,
      pageWidth: geometryEntry.width,
      pageHeight: geometryEntry.height,
      rects,
    }),
  };
}

export function pdfiumAnnotationFromAgentAnnotation(
  annotation: Annotation,
  pageText: string,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  geometry: PdfPageGeometry,
): Annotation | null {
  const range = pdfiumTextRangeForAgentAnnotation(annotation, pageText, pageIndex);
  if (!range) return null;
  const rects = pdfiumRectsForTextRange(geometry, range.start, range.end, pageWidth, pageHeight);
  if (rects.length === 0) return null;
  return {
    ...annotation,
    anchor: createPdfTextAnchor({
      pageText,
      pageIndex,
      start: range.start,
      end: range.end,
      pageWidth,
      pageHeight,
      rects,
    }),
  };
}

export function pdfiumMapTargetAgentAnnotation({
  annotation,
  geometry,
  pageHeight,
  pageIndex,
  pageText,
  pageWidth,
}: {
  annotation: Annotation;
  geometry: PdfPageGeometry;
  pageHeight: number;
  pageIndex: number;
  pageText: string;
  pageWidth: number;
}) {
  return pdfiumAnnotationFromAgentAnnotation(
    annotation,
    pageText,
    pageIndex,
    pageWidth,
    pageHeight,
    geometry,
  );
}

export function pdfiumTextRangeForAgentAnnotation(
  annotation: Annotation,
  pageText: string,
  pageIndex: number,
) {
  if (isPdfTextAnchor(annotation.anchor)) {
    return annotation.anchor.pageIndex === pageIndex
      ? { start: annotation.anchor.start, end: annotation.anchor.end }
      : null;
  }
  const direct = pageText.slice(annotation.anchor.start, annotation.anchor.end);
  if (direct === annotation.anchor.exact) {
    return { start: annotation.anchor.start, end: annotation.anchor.end };
  }
  const start = pageText.indexOf(annotation.anchor.exact);
  return start >= 0 ? { start, end: start + annotation.anchor.exact.length } : null;
}
