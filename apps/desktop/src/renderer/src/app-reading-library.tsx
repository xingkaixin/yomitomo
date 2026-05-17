import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type {
  Agent,
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  MessageSendShortcut,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import { annotationThreadComments, sortAnnotations, sortArticles } from '@yomitomo/core';
import { SourceBookcase } from './app-source-bookcase';
import type { ArticleUpdater, EbookImportProgressCallback } from './app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import type { ArticleImportResult } from './app-reading-library-imports';
import { groupLibraryArticles, type LibrarySort } from './app-reading-library-utils';

export { groupLibraryArticles };
export type { LibrarySort };

type BookmarkStatus = 'idle' | 'annotated' | 'co-reading';

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
  onImportArticleUrl,
  onRefresh,
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
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onRefresh: () => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
}) {
  const [activeShelf, setActiveShelf] = useState<'library' | 'source'>('library');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<string | null>(null);
  const sortedArticles = useMemo<ArticleRecord[]>(() => sortArticles(articles), [articles]);
  const selectedArticle =
    sortedArticles.find((article) => article.id === selectedArticleId) || null;
  const annotations = useMemo<Annotation[]>(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const stats = articles.reduce(
    (result, article) => ({
      annotations: result.annotations + article.annotations.length,
      comments:
        result.comments +
        article.annotations.reduce(
          (count, annotation) => count + annotationThreadComments(annotation).length,
          0,
        ),
    }),
    { annotations: 0, comments: 0 },
  );

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
    }
  }, [selectedArticleId, sortedArticles]);

  useEffect(() => {
    if (!openArticleId) return;
    const article = sortedArticles.find((item) => item.id === openArticleId);
    if (!article) return;
    openArticle(article);
    onArticleOpened?.(article.id);
  }, [openArticleId, onArticleOpened, sortedArticles]);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    if (selectedArticleId === articleId) {
      openLibraryShelf();
    }
  }

  function openArticle(article: ArticleRecord) {
    setSelectedArticleId(article.id);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setActiveShelf('source');
  }

  function openLibraryShelf() {
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setActiveShelf('library');
  }

  if (!selectedArticle) {
    return (
      <LibraryHome
        articles={articles}
        sortedArticles={sortedArticles}
        stats={stats}
        onDeleteArticle={deleteLibraryArticle}
        onImportEbookFile={onImportEbookFile}
        onImportArticleUrl={onImportArticleUrl}
        onOpenArticle={openArticle}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className={`library-bookcase-screen is-${activeShelf}-expanded`}>
      {activeShelf === 'library' ? (
        <div className="library-shelf is-expanded is-library-bookcase is-drawn-from-bookmark">
          <div className="library-shelf-content">
            <LibraryHome
              articles={articles}
              sortedArticles={sortedArticles}
              stats={stats}
              onDeleteArticle={deleteLibraryArticle}
              onImportEbookFile={onImportEbookFile}
              onImportArticleUrl={onImportArticleUrl}
              onOpenArticle={openArticle}
              onRefresh={onRefresh}
            />
          </div>
        </div>
      ) : (
        <>
          <LibraryBookmark
            annotationCount={annotations.length}
            status={
              selectedArticle.focusCoReadingPlan
                ? 'co-reading'
                : annotations.length > 0
                  ? 'annotated'
                  : 'idle'
            }
            onClick={openLibraryShelf}
          />
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
                onSaveArticle={onSaveArticle}
                onSaveArticleReadingProgress={onSaveArticleReadingProgress}
                onUpdateArticle={onUpdateArticle}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LibraryBookmark({
  annotationCount,
  status,
  onClick,
}: {
  annotationCount: number;
  status: BookmarkStatus;
  onClick: () => void;
}) {
  const statusLabel =
    status === 'co-reading'
      ? '当前文章有聚焦共读计划'
      : status === 'annotated'
        ? `当前文章有 ${annotationCount} 条批注`
        : '当前文章暂无批注';
  const label = `返回阅读库，${statusLabel}`;

  return (
    <button
      aria-label={label}
      className="library-bookmark-tab"
      title={label}
      type="button"
      onClick={onClick}
    >
      <ChevronLeft size={14} />
      <span className="library-bookmark-label">阅读库</span>
      <i aria-hidden="true" className={`library-bookmark-status is-${status}`} />
    </button>
  );
}
