import type { Dispatch, SetStateAction } from 'react';
import i18next from 'i18next';
import type { AgentReadingPlanItem, Annotation, PublicAgent } from '@yomitomo/shared';
import { isPdfTextAnchor } from '@yomitomo/shared';
import type { PdfPageGeometry } from '@embedpdf/models';
import { promptArticle } from '../bookcase/source-prompt-article';
import {
  type SourceAgentAnnotationAdapter,
  type SourceAgentAnnotationContext,
} from '../bookcase/use-source-reader-session';
import {
  pdfiumAgentAnnotationRequestOptions,
  pdfiumAnchorForReadingPlanStart,
  pdfiumMapReadingPlanAgentAnnotation,
  pdfiumMapTargetAgentAnnotation,
  pdfiumPromptArticle,
  type PdfPageGeometryEntry,
  type PdfTextDocument,
} from './app-source-bookcase-pdfium-utils';

type PdfiumControllerPage = {
  size: {
    height: number;
    width: number;
  };
};

type PdfiumControllerDocument = {
  pages: PdfiumControllerPage[];
};

type PdfiumReadingPlanSource = {
  document: PdfiumControllerDocument;
  kind: 'reading-plan';
  textDocument: PdfTextDocument;
};

type PdfiumTargetSource = {
  document: PdfiumControllerDocument;
  kind: 'target';
  page: PdfiumControllerPage;
  pageIndex: number;
  pageText: string;
  targetAnchor: Annotation['anchor'] | undefined;
};

type PdfiumSource = PdfiumReadingPlanSource | PdfiumTargetSource;

type PdfiumReadingPlanPlayback = {
  acceptedAnnotation: boolean;
  kind: 'reading-plan';
  pageGeometryByIndex: Map<number, PdfPageGeometryEntry>;
  playbackPromise: Promise<void>;
};

type PdfiumTargetPlayback = {
  acceptedAnnotation: boolean;
  geometry: PdfPageGeometry | null;
  kind: 'target';
  playbackPromise: Promise<void>;
};

type PdfiumPlayback = PdfiumReadingPlanPlayback | PdfiumTargetPlayback;

type PdfiumSourceReaderControllerOptions = {
  enqueueAgentAnnotationPlayback: (articleId: string, annotation: Annotation) => Promise<void>;
  extractPageText: (pageIndex: number) => Promise<string>;
  finishAgentDock: (agentId: string, succeeded: boolean) => void;
  finishVirtualReading: (agentId: string, suffix?: string) => void;
  getDocument: () => PdfiumControllerDocument | undefined;
  getPageGeometry: (
    document: PdfiumControllerDocument,
    page: PdfiumControllerPage,
  ) => Promise<PdfPageGeometry | null>;
  getPdfTextDocument: () => PdfTextDocument | null;
  isCurrentArticle: (articleId: string) => boolean;
  pageGeometriesForReadingPlan: (
    document: PdfiumControllerDocument,
    textDocument: PdfTextDocument,
    readingPlan: AgentReadingPlanItem[],
  ) => Promise<Map<number, PdfPageGeometryEntry>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  startAgentDock: (agent: PublicAgent) => void;
  startVirtualReading: (agent: PublicAgent, anchor: Annotation['anchor'] | undefined) => void;
};

function shouldShowProgress(context: SourceAgentAnnotationContext<PdfiumSource>) {
  return context.source?.kind === 'reading-plan'
    ? context.visibleArticle !== false
    : context.showProgress !== false;
}

export function createPdfiumSourceReaderController({
  enqueueAgentAnnotationPlayback,
  extractPageText,
  finishAgentDock,
  finishVirtualReading,
  getDocument,
  getPageGeometry,
  getPdfTextDocument,
  isCurrentArticle,
  pageGeometriesForReadingPlan,
  setStatusMessage,
  startAgentDock,
  startVirtualReading,
}: PdfiumSourceReaderControllerOptions): SourceAgentAnnotationAdapter<
  PdfiumSource,
  PdfiumPlayback
> {
  return {
    resolveOptions: ({ options }) => pdfiumAgentAnnotationRequestOptions(options),
    getContext: async ({ currentArticle, options }) => {
      const document = getDocument();
      const articleId = options.articleId || currentArticle.id;
      if (!document || !articleId) return null;

      if (options.readingPlan?.length && !options.targetAnchor) {
        const textDocument = getPdfTextDocument();
        if (!textDocument) return null;
        return {
          article: promptArticle(currentArticle, textDocument.text),
          articleId,
          articleText: textDocument.text,
          readingMemory: currentArticle.focusCoReadingPlan?.readingMemory,
          source: { document, kind: 'reading-plan' as const, textDocument },
          visibleArticle: isCurrentArticle(articleId),
        };
      }

      const targetAnchor = options.targetAnchor;
      const pageIndex = targetAnchor && isPdfTextAnchor(targetAnchor) ? targetAnchor.pageIndex : 0;
      const page = document.pages[pageIndex];
      if (!page) return null;
      const pageText = await extractPageText(pageIndex);
      return {
        article: options.article || pdfiumPromptArticle(currentArticle, targetAnchor, pageText),
        articleId,
        articleText: pageText,
        showProgress: isCurrentArticle(articleId),
        source: { document, kind: 'target' as const, page, pageIndex, pageText, targetAnchor },
        visibleArticle: isCurrentArticle(articleId),
      };
    },
    start: async ({ agent, context, requestInput }) => {
      if (context.source?.kind === 'reading-plan') {
        const visibleArticle = context.visibleArticle !== false;
        if (visibleArticle) startAgentDock(agent);
        const pageGeometryByIndex = await pageGeometriesForReadingPlan(
          context.source.document,
          context.source.textDocument,
          requestInput.readingPlan,
        );
        if (visibleArticle) {
          startVirtualReading(
            agent,
            pdfiumAnchorForReadingPlanStart(
              requestInput.readingPlan,
              context.source.textDocument,
              pageGeometryByIndex,
            ),
          );
        }
        return {
          acceptedAnnotation: false,
          kind: 'reading-plan' as const,
          pageGeometryByIndex,
          playbackPromise: Promise.resolve(),
        };
      }

      if (context.showProgress !== false) {
        startAgentDock(agent);
        startVirtualReading(agent, context.source?.targetAnchor);
      }
      const geometry =
        context.source?.kind === 'target'
          ? await getPageGeometry(context.source.document, context.source.page)
          : null;
      return {
        acceptedAnnotation: false,
        geometry,
        kind: 'target' as const,
        playbackPromise: Promise.resolve(),
      };
    },
    onAnnotation: ({ annotation, context, playback, requestInput }) => {
      if (context.source?.kind === 'reading-plan' && playback?.kind === 'reading-plan') {
        const pdfAnnotation = pdfiumMapReadingPlanAgentAnnotation(
          annotation,
          requestInput.readingPlan,
          context.source.textDocument,
          playback.pageGeometryByIndex,
        );
        if (!pdfAnnotation) return false;
        playback.acceptedAnnotation = true;
        playback.playbackPromise = enqueueAgentAnnotationPlayback(context.articleId, pdfAnnotation);
        return true;
      }

      if (context.source?.kind !== 'target' || playback?.kind !== 'target' || !playback.geometry) {
        return false;
      }
      const pdfAnnotation = pdfiumMapTargetAgentAnnotation({
        annotation,
        geometry: playback.geometry,
        pageHeight: context.source.page.size.height,
        pageIndex: context.source.pageIndex,
        pageText: context.source.pageText,
        pageWidth: context.source.page.size.width,
      });
      if (!pdfAnnotation) return false;
      playback.acceptedAnnotation = true;
      playback.playbackPromise = enqueueAgentAnnotationPlayback(context.articleId, pdfAnnotation);
      return true;
    },
    onEmpty: ({ agent, context }) => {
      const message = i18next.t('source.agentStatus.noNewThought');
      if (context.source?.kind === 'reading-plan' && context.visibleArticle !== false) {
        finishVirtualReading(agent.id, message);
        setStatusMessage(
          i18next.t('source.agentStatus.noNewThoughtWithName', { name: agent.nickname }),
        );
        window.setTimeout(() => setStatusMessage(''), 1400);
        return;
      }
      if (context.showProgress !== false) finishVirtualReading(agent.id, message);
    },
    onSuccess: async ({ playback }) => {
      if (playback?.acceptedAnnotation) await playback.playbackPromise;
    },
    finish: ({ agent, context, requestFailed }) => {
      if (!shouldShowProgress(context)) return;
      if (requestFailed)
        finishVirtualReading(agent.id, i18next.t('source.agentStatus.addThoughtFailed'));
      finishAgentDock(agent.id, !requestFailed);
    },
  };
}
