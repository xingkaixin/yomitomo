import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, PencilLine } from 'lucide-react';
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
import { ReadingCard } from './app-reading-card-panel';
import { SourceBookcase } from './app-source-bookcase';
import type { ArticleUpdater, EbookImportProgressCallback } from './app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import type { ArticleImportResult } from './app-reading-library-imports';
import { groupLibraryArticles, type LibrarySort } from './app-reading-library-utils';

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
  const [activeShelf, setActiveShelf] = useState<'library' | 'source' | 'card'>('library');
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
  const reviewAgents = useMemo(
    () => agents.filter((agent) => agent.kind === 'review' && agent.enabled),
    [agents],
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

  function openSourceShelf() {
    if (!selectedArticle) return;
    setSourceFocusAnnotationId(selectedAnnotation?.id || null);
    setActiveShelf('source');
  }

  function openCardShelf() {
    if (!selectedArticle) return;
    setSourceFocusAnnotationId(null);
    setActiveShelf('card');
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
      <div
        className={
          activeShelf === 'library'
            ? 'library-shelf is-expanded is-library-bookcase'
            : 'library-shelf is-collapsed is-library-bookcase'
        }
      >
        <ShelfTab
          actionLabel="返回阅读库"
          icon={<ChevronLeft size={18} />}
          label="阅读库"
          variant="library"
          onClick={openLibraryShelf}
        />
        <div className="library-shelf-content">
          {activeShelf === 'library' ? (
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
          ) : null}
        </div>
      </div>

      {activeShelf === 'library' ? null : (
        <>
          <div
            className={
              activeShelf === 'source' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
            }
          >
            <ShelfTab
              actionLabel="返回原文"
              count={annotations.length}
              icon={<BookOpen size={18} />}
              label="原文"
              variant="view"
              onClick={openSourceShelf}
            />
            <div className="library-shelf-content">
              {activeShelf === 'source' ? (
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
              ) : null}
            </div>
          </div>

          <div
            className={
              activeShelf === 'card' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
            }
          >
            <ShelfTab
              actionLabel="打开读后回执"
              count={selectedArticle?.readingCard?.sections.length ?? 0}
              icon={<PencilLine size={18} />}
              label="回执"
              variant="view"
              onClick={openCardShelf}
            />
            <div className="library-shelf-content">
              {activeShelf === 'card' ? (
                <ReadingCard
                  article={selectedArticle}
                  reviewAgents={reviewAgents}
                  onGenerated={onRefresh}
                  onOpenEvidence={(annotationId) => {
                    setSelectedAnnotationId(annotationId);
                    setSourceFocusAnnotationId(annotationId);
                    setActiveShelf('source');
                  }}
                />
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ShelfTab({
  actionLabel,
  count,
  icon,
  label,
  variant,
  onClick,
}: {
  actionLabel: string;
  count?: number;
  icon: React.ReactNode;
  label: string;
  variant: 'library' | 'view';
  onClick: () => void;
}) {
  const className = [
    'library-shelf-tab',
    `is-${variant}-rail`,
    count === undefined ? 'is-title-only' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      aria-label={actionLabel}
      className={className}
      title={actionLabel}
      type="button"
      onClick={onClick}
    >
      <span className="library-shelf-tab-icon">{icon}</span>
      <span className="library-shelf-tab-label">{label}</span>
      {count === undefined ? null : <span className="library-shelf-tab-count">{count}</span>}
    </button>
  );
}
