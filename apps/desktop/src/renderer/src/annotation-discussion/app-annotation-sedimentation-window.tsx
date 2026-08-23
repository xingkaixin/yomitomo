import { HugeiconsIcon } from '@hugeicons/react';
import {
  CloudUploadIcon,
  RotateLeft01Icon,
  SentIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { annotationAuthorName } from '@yomitomo/core';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { FloatingComposer } from '@yomitomo/reader-ui/floating-composer';
import {
  AgentAvatarStack,
  ReaderTooltipProvider,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import { applyAppTheme, readCachedThemeId, themeRegistry } from '../theme/app-theme';
import { useSourceAwareWindowTransition } from '../shell/app-window-transition';
import {
  DraftAnchorHighlightLayer,
  DraftChangePreviewLayer,
} from './app-annotation-sedimentation-draft-preview';
import {
  OrganizeDiscussionCard,
  OrganizeDiscussionConfirmDialog,
} from './app-annotation-sedimentation-organize-card';
import { SedimentationReviewTimeline } from './app-annotation-sedimentation-review-timeline';
import { useAnnotationWindowArticlePatches } from './use-annotation-window-article-patches';
import { annotationWindowActions } from './app-annotation-window-actions';
import {
  useAnnotationSedimentationController,
  type SedimentationReadyStatus,
} from './use-annotation-sedimentation-controller';

type SedimentationWindowStatus =
  | { type: 'loading' }
  | SedimentationReadyStatus
  | { type: 'missing' }
  | { type: 'error'; message: string };

export function AnnotationSedimentationWindowApp() {
  const { t } = useTranslation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const articleId = params.get('articleId') || '';
  const annotationId = params.get('annotationId') || '';
  const [status, setStatus] = useState<SedimentationWindowStatus>({ type: 'loading' });
  const pendingArticleUpdateRef = useRef<ArticleRecord | null | undefined>(undefined);
  const windowTransition = useSourceAwareWindowTransition(params);

  useAnnotationWindowArticlePatches(articleId, annotationId, (article) => {
    pendingArticleUpdateRef.current = article;
    setStatus((current) => {
      if (!article) return { type: 'missing' };
      if (current.type !== 'ready') return current;
      const annotation = article.annotations.find((item) => item.id === annotationId);
      return annotation ? { ...current, annotation, article } : { type: 'missing' };
    });
  });

  useEffect(() => {
    const syncTheme = () => applyAppTheme(themeRegistry[readCachedThemeId()]);
    window.addEventListener('storage', syncTheme);
    window.addEventListener('focus', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('focus', syncTheme);
    };
  }, []);

  useEffect(() => {
    document.title =
      status.type === 'ready'
        ? sedimentationWindowTitle(status.annotation)
        : t('sedimentation.title');
  }, [status, t]);

  useEffect(() => {
    let cancelled = false;
    if (!articleId || !annotationId) {
      setStatus({ type: 'missing' });
      return;
    }

    void annotationWindowActions
      .loadWindow(articleId)
      .then(({ article, store }) => {
        if (cancelled) return;
        const pendingArticle = pendingArticleUpdateRef.current;
        const currentArticle = pendingArticle === undefined ? article : pendingArticle;
        const annotation = currentArticle?.annotations.find((item) => item.id === annotationId);
        setStatus(
          pendingArticle !== null && currentArticle && annotation
            ? {
                type: 'ready',
                agents: store.agents,
                article: currentArticle,
                annotation,
                uiLanguage: normalizeUiLanguage(store.settings?.uiLanguage),
              }
            : { type: 'missing' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : t('sedimentation.loadFailed'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [annotationId, articleId, t]);

  if (status.type !== 'ready') {
    return (
      <SedimentationEmptyState
        status={status}
        className={windowTransition.className}
        style={windowTransition.style}
      />
    );
  }
  return (
    <SedimentationShell
      status={status}
      style={windowTransition.style}
      className={windowTransition.className}
      onStatusChange={setStatus}
    />
  );
}

function SedimentationShell({
  className,
  status,
  style,
  onStatusChange,
}: {
  className: string;
  status: SedimentationReadyStatus;
  style: CSSProperties;
  onStatusChange: (status: SedimentationWindowStatus) => void;
}) {
  const { t } = useTranslation();
  const { article, annotation } = status;
  const { draft, organize, publication, review, shortcut } = useAnnotationSedimentationController({
    status,
    onStatusChange,
  });
  const userProfile = sedimentationUserProfile(annotation, article);
  const statusLabel = publication.isPublished
    ? t('sedimentation.status.published')
    : t('sedimentation.status.draft');
  const publishLabel = publication.isPublished
    ? t('sedimentation.updatePublish')
    : t('sedimentation.publish');

  return (
    <ReaderTooltipProvider>
      <main
        className={[sedimentationWindowClassName(), className].filter(Boolean).join(' ')}
        style={style}
      >
        <section className="annotation-sedimentation-quote" aria-label={t('sedimentation.quote')}>
          <span aria-hidden="true">“</span>
          <p>{annotation.anchor.exact}</p>
        </section>
        <section className="annotation-sedimentation-body">
          <section
            className="annotation-sedimentation-document"
            aria-label={t('sedimentation.document')}
          >
            <header>
              <div className="annotation-sedimentation-document-title">
                <strong>{t('sedimentation.draftTitle')}</strong>
                <span
                  className={`annotation-sedimentation-status is-${publication.isPublished ? 'published' : 'draft'}`}
                >
                  {statusLabel}
                </span>
              </div>
              <div className="annotation-sedimentation-document-actions">
                {publication.isPublished ? (
                  <ReaderTooltip
                    content={
                      <SedimentationActionTooltipContent
                        label={t('sedimentation.unpublish')}
                        description={t('sedimentation.unpublishTooltip')}
                      />
                    }
                  >
                    <button
                      className="is-secondary"
                      type="button"
                      disabled={!publication.canUnpublish}
                      onClick={() => void publication.unpublish()}
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={15} />
                      <span>{t('sedimentation.unpublish')}</span>
                    </button>
                  </ReaderTooltip>
                ) : null}
                <ReaderTooltip
                  content={
                    <SedimentationActionTooltipContent
                      label={t('sedimentation.organizeDiscussion')}
                      description={t('sedimentation.organizeTooltip')}
                    />
                  }
                >
                  <button
                    className="is-secondary"
                    type="button"
                    disabled={!organize.canRun}
                    onClick={organize.request}
                  >
                    <HugeiconsIcon icon={SparklesIcon} size={15} />
                    <span>{t('sedimentation.organizeDiscussion')}</span>
                  </button>
                </ReaderTooltip>
                <ReaderTooltip
                  content={
                    <SubmitShortcutTooltipContent
                      label={publishLabel}
                      shortcut={shortcut.messageSendShortcut}
                      shortcutModifier={shortcut.shortcutModifier}
                    />
                  }
                >
                  <button
                    type="button"
                    disabled={!publication.canPublish}
                    onClick={() => void publication.publish()}
                  >
                    <HugeiconsIcon icon={CloudUploadIcon} size={15} />
                    <span>{publishLabel}</span>
                  </button>
                </ReaderTooltip>
              </div>
            </header>
            <div className="annotation-sedimentation-draft-workspace">
              <div
                className={[
                  'annotation-sedimentation-draft-editor',
                  draft.preview ? 'has-preview' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {draft.preview ? (
                  <DraftChangePreviewLayer
                    changeSet={draft.preview.changeSet}
                    decisions={draft.preview.decisions}
                    scrollLeft={draft.scroll.left}
                    scrollTop={draft.scroll.top}
                    onDecision={(proposalId, decision) =>
                      void draft.decidePreview(proposalId, decision)
                    }
                  />
                ) : draft.hoveredAnchor ? (
                  <DraftAnchorHighlightLayer
                    anchor={draft.hoveredAnchor}
                    draft={draft.value}
                    scrollLeft={draft.scroll.left}
                    scrollTop={draft.scroll.top}
                  />
                ) : null}
                <textarea
                  ref={draft.textareaRef}
                  value={draft.value}
                  readOnly={Boolean(draft.preview)}
                  placeholder={draft.preview ? '' : t('sedimentation.draftPlaceholder')}
                  onChange={(event) => draft.change(event.target.value)}
                  onClick={draft.recordSelection}
                  onKeyDown={draft.handlePublishKeyDown}
                  onKeyUp={draft.recordSelection}
                  onScroll={draft.syncScroll}
                  onSelect={draft.recordSelection}
                />
              </div>
              {organize.state.type !== 'idle' ? (
                <OrganizeDiscussionCard
                  state={organize.state}
                  appliedProposalIds={organize.appliedProposalIds}
                  dismissedProposalIds={organize.dismissedProposalIds}
                  pendingProposalIds={organize.pendingProposalIds}
                  onProposalAnchorEnter={draft.enterProposalAnchor}
                  onProposalAnchorLeave={draft.leaveProposalAnchor}
                  onPreviewProposals={(proposals) => {
                    organize.previewProposals(proposals);
                  }}
                  onClose={organize.close}
                  onRetry={() => void organize.retry()}
                />
              ) : null}
            </div>
          </section>

          <aside
            className="annotation-sedimentation-review-panel"
            aria-label={t('sedimentation.reviewPanel')}
          >
            <header>
              <div>
                <strong>{t('sedimentation.reviewTitle')}</strong>
                <span>{review.notice || t('sedimentation.reviewHint')}</span>
              </div>
            </header>
            <SedimentationReviewTimeline
              agents={review.agents}
              sessions={review.sessions}
              userProfile={userProfile}
              pendingProposalIds={review.pendingProposalIds}
              onProposalAnchorEnter={draft.enterProposalAnchor}
              onProposalAnchorLeave={draft.leaveProposalAnchor}
              onProposalPreview={(messageId, proposals) => {
                review.previewProposals(messageId, proposals);
              }}
              onProposalIgnore={review.ignoreProposal}
              onProposalRestore={review.restoreProposal}
            />
            <footer>
              <FloatingComposer
                className="annotation-sedimentation-review-composer"
                accessory={
                  <div
                    className="annotation-sedimentation-review-composer-accessory"
                    aria-label={t('sedimentation.reviewAgents')}
                  >
                    <AgentAvatarStack
                      agents={review.agents}
                      activeAgentIds={review.activeAgentId ? [review.activeAgentId] : []}
                      ariaLabel={t('sedimentation.reviewAgents')}
                      className={review.reviewing ? 'is-reviewing' : ''}
                      revealLabelOnDoubleClick={false}
                      onAgentClick={review.selectAgent}
                    />
                  </div>
                }
                submitDisabled={!review.canSubmit}
                submitIcon={<HugeiconsIcon icon={SentIcon} size={14} />}
                submitLabel={t('sedimentation.send')}
                submitTooltip={
                  <SubmitShortcutTooltipContent
                    label={t('sedimentation.sendReviewRequest')}
                    shortcut={shortcut.messageSendShortcut}
                    shortcutModifier={shortcut.shortcutModifier}
                  />
                }
                textarea={{
                  value: review.value,
                  placeholder: t('sedimentation.reviewPlaceholder'),
                  rows: 2,
                  onChange: (event) => review.change(event.target.value),
                  onKeyDown: review.handleKeyDown,
                }}
                onSubmit={() => void review.submit()}
              />
            </footer>
          </aside>
        </section>
        <OrganizeDiscussionConfirmDialog
          disabled={!organize.canRun}
          open={organize.confirmOpen}
          onCancel={organize.cancel}
          onConfirm={organize.confirm}
        />
      </main>
    </ReaderTooltipProvider>
  );
}

function SedimentationActionTooltipContent({
  description,
  label,
}: {
  description: string;
  label: string;
}) {
  return (
    <span className="annotation-sedimentation-action-tooltip">
      <strong>{label}</strong>
      <em>{description}</em>
    </span>
  );
}

function SedimentationEmptyState({
  className,
  status,
  style,
}: {
  className: string;
  status: Exclude<SedimentationWindowStatus, { type: 'ready' }>;
  style: CSSProperties;
}) {
  const { t } = useTranslation();
  return (
    <main
      className={[sedimentationWindowClassName(), className].filter(Boolean).join(' ')}
      style={style}
    >
      <section className="annotation-sedimentation-empty">
        <strong>
          {status.type === 'loading' ? t('sedimentation.loading') : t('sedimentation.openFailed')}
        </strong>
        <p>{status.type === 'error' ? status.message : t('sedimentation.missing')}</p>
      </section>
    </main>
  );
}

function sedimentationWindowClassName() {
  return [
    'annotation-sedimentation-window',
    `is-${annotationWindowActions.platform() ?? 'unknown'}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function sedimentationWindowTitle(annotation: Annotation) {
  const quote = compactTitleText(annotation.anchor.exact);
  return quote
    ? i18next.t('sedimentation.windowTitle', { title: quote })
    : i18next.t('sedimentation.title');
}

function compactTitleText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
}

function sedimentationUserProfile(annotation: Annotation, article: ArticleRecord): UserProfile {
  const author = annotation.author.kind === 'user' ? annotation.author : undefined;
  return {
    id: author?.userId || 'user',
    nickname: author ? annotationAuthorName(author) : i18next.t('common.me'),
    username: author?.username || 'user',
    avatar: author?.avatar || '',
    annotationColor: author?.annotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}
