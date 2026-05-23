import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Agent,
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  MessageSendShortcut,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import { sortAnnotations, sortArticles } from '@yomitomo/core';
import { SourceBookcase } from './app-source-bookcase';
import type {
  ArticleUpdater,
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from './app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import type { ArticleImportResult } from './app-reading-library-imports';
import {
  groupLibraryArticles,
  librarySourceForArticle,
  type LibrarySort,
  type LibrarySource,
} from './app-reading-library-utils';

export { groupLibraryArticles };
export type { LibrarySort };

export function ReadingLibrary({
  agents,
  articles,
  messageSendShortcut,
  selectionActionShortcuts,
  openArticleId,
  userProfile,
  onArticleOpened,
  onDeleteArticle,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onReadingModeChange,
  onReadArticle,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onUpdateArticle,
}: {
  agents: Agent[];
  articles: ArticleRecord[];
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  openArticleId?: string | null;
  userProfile: UserProfile;
  onArticleOpened?: (articleId: string) => void;
  onDeleteArticle: (articleId: string) => Promise<void> | void;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onReadingModeChange?: (open: boolean) => void;
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
}) {
  const [activeShelf, setActiveShelf] = useState<'library' | 'source'>('library');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ArticleRecord | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<string | null>(null);
  const [librarySource, setLibrarySource] = useState<LibrarySource>('web');
  const articleLoadRef = useRef(0);
  const sortedArticles = useMemo<ArticleRecord[]>(() => sortArticles(articles), [articles]);
  const annotations = useMemo<Annotation[]>(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  useEffect(() => {
    if (!selectedArticle) {
      setSelectedAnnotationId(null);
      return;
    }
    setSelectedAnnotationId(null);
  }, [selectedArticle?.id]);

  useEffect(() => {
    if (selectedArticleId && !sortedArticles.some((article) => article.id === selectedArticleId)) {
      setSelectedArticleId(null);
      setSelectedArticle(null);
    }
  }, [selectedArticleId, sortedArticles]);

  useEffect(() => {
    if (!openArticleId) return;
    const article = sortedArticles.find((item) => item.id === openArticleId);
    if (!article) return;
    void openArticle(article);
    onArticleOpened?.(article.id);
  }, [openArticleId, onArticleOpened, sortedArticles]);

  useEffect(() => {
    onReadingModeChange?.(Boolean(selectedArticle && activeShelf === 'source'));
    return () => onReadingModeChange?.(false);
  }, [activeShelf, onReadingModeChange, selectedArticle]);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    if (selectedArticleId === articleId) {
      setSelectedArticle(null);
      openLibraryShelf();
    }
  }

  async function openArticle(article: ArticleRecord) {
    const loadId = articleLoadRef.current + 1;
    articleLoadRef.current = loadId;
    setLibrarySource(librarySourceForArticle(article));
    setSelectedArticleId(article.id);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    const fullArticle = articleHasReadableBody(article) ? article : await onReadArticle(article.id);
    if (articleLoadRef.current !== loadId || !fullArticle) return;
    setSelectedArticle(fullArticle);
    setActiveShelf('source');
  }

  function openLibraryShelf() {
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setActiveShelf('library');
  }

  async function saveSelectedArticle(article: ArticleRecord) {
    setSelectedArticle(article);
    await onSaveArticle(article);
  }

  async function saveSelectedArticleReadingProgress(
    articleId: string,
    progress: ArticleReadingProgress,
  ) {
    setSelectedArticle((current) =>
      current?.id === articleId
        ? { ...current, readingProgress: progress, updatedAt: progress.updatedAt }
        : current,
    );
    await onSaveArticleReadingProgress(articleId, progress);
  }

  async function updateSelectedArticle(articleId: string, update: ArticleUpdater) {
    await onUpdateArticle(articleId, (article) => {
      const nextArticle = update(selectedArticle?.id === articleId ? selectedArticle : article);
      if (nextArticle) setSelectedArticle(nextArticle);
      return nextArticle;
    });
  }

  if (!selectedArticle) {
    return (
      <LibraryHome
        activeSource={librarySource}
        articles={articles}
        onActiveSourceChange={setLibrarySource}
        sortedArticles={sortedArticles}
        onDeleteArticle={deleteLibraryArticle}
        onImportEbookFile={onImportEbookFile}
        onImportPdfFile={onImportPdfFile}
        onImportArticleUrl={onImportArticleUrl}
        onOpenArticle={(article) => void openArticle(article)}
      />
    );
  }

  return (
    <div className={`library-bookcase-screen is-${activeShelf}-expanded`}>
      {activeShelf === 'library' ? (
        <div className="library-shelf is-expanded is-library-bookcase is-drawn-from-bookmark">
          <div className="library-shelf-content">
            <LibraryHome
              activeSource={librarySource}
              articles={articles}
              onActiveSourceChange={setLibrarySource}
              sortedArticles={sortedArticles}
              onDeleteArticle={deleteLibraryArticle}
              onImportEbookFile={onImportEbookFile}
              onImportPdfFile={onImportPdfFile}
              onImportArticleUrl={onImportArticleUrl}
              onOpenArticle={(article) => void openArticle(article)}
            />
          </div>
        </div>
      ) : (
        <div className="library-shelf is-expanded">
          <div className="library-shelf-content">
            <SourceBookcase
              agents={agents}
              annotations={annotations}
              article={selectedArticle}
              focusAnnotationId={sourceFocusAnnotationId}
              messageSendShortcut={messageSendShortcut}
              selectionActionShortcuts={selectionActionShortcuts}
              selectedAnnotationId={selectedAnnotation?.id || null}
              userProfile={userProfile}
              onFocusedAnnotation={() => setSourceFocusAnnotationId(null)}
              onClose={openLibraryShelf}
              onOpenAnnotation={setSelectedAnnotationId}
              onSaveArticle={saveSelectedArticle}
              onSaveArticleReadingProgress={saveSelectedArticleReadingProgress}
              onUpdateArticle={updateSelectedArticle}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function articleHasReadableBody(article: ArticleRecord) {
  if ((article.annotationCount ?? 0) > article.annotations.length) return false;
  if (article.sourceType === 'ebook') return Boolean(article.ebook?.chapters.length);
  if (article.sourceType === 'pdf') return Boolean(article.pdf);
  return Boolean(article.contentHtml);
}
