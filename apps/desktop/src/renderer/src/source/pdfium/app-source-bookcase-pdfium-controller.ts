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
} from './pdfium-agent-plan';
import type { PdfPageGeometryEntry } from './pdfium-geometry';
import type { PdfTextDocument } from './pdfium-text-document';

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
}: PdfiumSourceReaderControllerOptions): SourceAgentAnnotationAdapter<PdfiumSource> {
  return {
    prepare: async ({ agent, currentArticle, options }) => {
      const requestOptions = pdfiumAgentAnnotationRequestOptions(options);
      const document = getDocument();
      const articleId = requestOptions.articleId || currentArticle.id;
      if (!document || !articleId) return null;

      if (requestOptions.readingPlan?.length && !requestOptions.targetAnchor) {
        const textDocument = getPdfTextDocument();
        if (!textDocument) return null;
        const context: SourceAgentAnnotationContext<PdfiumReadingPlanSource> = {
          article: promptArticle(currentArticle, textDocument.text),
          articleId,
          articleText: textDocument.text,
          readingMemory: currentArticle.focusCoReadingPlan?.readingMemory,
          source: { document, kind: 'reading-plan', textDocument },
          visibleArticle: isCurrentArticle(articleId),
        };
        return {
          context,
          options: requestOptions,
          start: async (requestInput) => {
            const visibleArticle = context.visibleArticle !== false;
            if (visibleArticle) startAgentDock(agent);
            const pageGeometryByIndex = await pageGeometriesForReadingPlan(
              document,
              textDocument,
              requestInput.readingPlan,
            );
            if (visibleArticle) {
              startVirtualReading(
                agent,
                pdfiumAnchorForReadingPlanStart(
                  requestInput.readingPlan,
                  textDocument,
                  pageGeometryByIndex,
                ),
              );
            }
            let acceptedAnnotation = false;
            let playbackPromise = Promise.resolve();
            return {
              accept: (annotation) => {
                const pdfAnnotation = pdfiumMapReadingPlanAgentAnnotation(
                  annotation,
                  requestInput.readingPlan,
                  textDocument,
                  pageGeometryByIndex,
                );
                if (!pdfAnnotation) return false;
                acceptedAnnotation = true;
                playbackPromise = enqueueAgentAnnotationPlayback(articleId, pdfAnnotation);
                return true;
              },
              finish: async (outcome) => {
                if (outcome.status === 'empty' && visibleArticle) {
                  const message = i18next.t('source.agentStatus.noNewThought');
                  finishVirtualReading(agent.id, message);
                  setStatusMessage(
                    i18next.t('source.agentStatus.noNewThoughtWithName', {
                      name: agent.nickname,
                    }),
                  );
                  window.setTimeout(() => setStatusMessage(''), 1400);
                }
                if (outcome.status === 'success' && acceptedAnnotation) await playbackPromise;
                if (!shouldShowProgress(context)) return;
                if (outcome.status === 'failure') {
                  finishVirtualReading(agent.id, i18next.t('source.agentStatus.addThoughtFailed'));
                }
                finishAgentDock(agent.id, outcome.status !== 'failure');
              },
            };
          },
        };
      }

      const targetAnchor = requestOptions.targetAnchor;
      const pageIndex = targetAnchor && isPdfTextAnchor(targetAnchor) ? targetAnchor.pageIndex : 0;
      const page = document.pages[pageIndex];
      if (!page) return null;
      const pageText = await extractPageText(pageIndex);
      const context: SourceAgentAnnotationContext<PdfiumTargetSource> = {
        article:
          requestOptions.article || pdfiumPromptArticle(currentArticle, targetAnchor, pageText),
        articleId,
        articleText: pageText,
        showProgress: isCurrentArticle(articleId),
        source: { document, kind: 'target', page, pageIndex, pageText, targetAnchor },
        visibleArticle: isCurrentArticle(articleId),
      };
      return {
        context,
        options: requestOptions,
        start: async () => {
          if (context.showProgress !== false) {
            startAgentDock(agent);
            startVirtualReading(agent, targetAnchor);
          }
          const geometry = await getPageGeometry(document, page);
          let acceptedAnnotation = false;
          let playbackPromise = Promise.resolve();
          return {
            accept: (annotation) => {
              if (!geometry) return false;
              const pdfAnnotation = pdfiumMapTargetAgentAnnotation({
                annotation,
                geometry,
                pageHeight: page.size.height,
                pageIndex,
                pageText,
                pageWidth: page.size.width,
              });
              if (!pdfAnnotation) return false;
              acceptedAnnotation = true;
              playbackPromise = enqueueAgentAnnotationPlayback(articleId, pdfAnnotation);
              return true;
            },
            finish: async (outcome) => {
              if (outcome.status === 'empty' && context.showProgress !== false) {
                finishVirtualReading(agent.id, i18next.t('source.agentStatus.noNewThought'));
              }
              if (outcome.status === 'success' && acceptedAnnotation) await playbackPromise;
              if (!shouldShowProgress(context)) return;
              if (outcome.status === 'failure') {
                finishVirtualReading(agent.id, i18next.t('source.agentStatus.addThoughtFailed'));
              }
              finishAgentDock(agent.id, outcome.status !== 'failure');
            },
          };
        },
      };
    },
  };
}
