import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, BubbleChatIcon, DragDropVerticalIcon } from '@hugeicons/core-free-icons';
import { useCallback, useMemo, useReducer, type CSSProperties } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import type { ArticleRecord, Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationAuthorName, annotationColor } from '@yomitomo/core';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import type {
  AnnotationDiscussionWindowState,
  WindowAnimationSourceRect,
} from '../../../ipc-contract';
import { bindDiscussionCapsuleDock, type DiscussionDockCorner } from './discussion-capsule-dock';
import { elementWindowSourceRect } from '../shell/app-window-transition';

type AnnotationDiscussionCapsuleAssistant = {
  key: string;
  name: string;
  avatar?: string;
};

type AnnotationDiscussionCapsuleItem = {
  articleId: string;
  annotationId: string;
  windowId: number;
  color?: string;
  quote: string;
  ideaCount: number;
  replyCount: number;
  assistants: AnnotationDiscussionCapsuleAssistant[];
  pending: boolean;
};

function annotationDiscussionCapsuleItems(
  article: ArticleRecord,
  windows: AnnotationDiscussionWindowState[],
  userProfile: UserProfile,
  agents: PublicAgent[] = [],
): AnnotationDiscussionCapsuleItem[] {
  return windows.map((windowState) => {
    const annotation = article.annotations.find((item) => item.id === windowState.annotationId);
    const comments = annotation?.comments || [];
    const ideaCount = comments.filter((comment) => !comment.replyTo).length;
    const replyCount = comments.length - ideaCount;
    return {
      articleId: windowState.articleId,
      annotationId: windowState.annotationId,
      windowId: windowState.windowId,
      color: annotation ? annotationColor(annotation, userProfile, agents) : undefined,
      quote: annotation?.anchor.exact.trim() || i18next.t('discussion.fallbackQuote'),
      ideaCount,
      replyCount,
      assistants: assistantParticipants(comments, agents),
      pending: comments.some((comment) => comment.pending),
    };
  });
}

function assistantParticipants(
  comments: Comment[],
  agents: PublicAgent[],
): AnnotationDiscussionCapsuleAssistant[] {
  const assistants = new Map<string, AnnotationDiscussionCapsuleAssistant>();
  for (const comment of comments) {
    const author = comment.author;
    if (author.kind !== 'agent') continue;
    const key = author.agentId;
    if (assistants.has(key)) continue;
    const agent = agents.find((item) => item.id === author.agentId);
    const name =
      agent?.nickname || annotationAuthorName(author).trim() || i18next.t('common.assistant');
    const avatar = agent?.avatar || author.avatar?.trim() || undefined;
    assistants.set(key, {
      key,
      name,
      avatar,
    });
  }
  return [...assistants.values()];
}

export function AnnotationDiscussionCapsules({
  agents,
  article,
  userProfile,
  windows,
  onOpen,
  corner,
  onDock,
}: {
  agents?: PublicAgent[];
  corner: DiscussionDockCorner;
  onDock: (corner: DiscussionDockCorner) => void;
  article: ArticleRecord;
  userProfile: UserProfile;
  windows: AnnotationDiscussionWindowState[];
  onOpen?: (
    articleId: string,
    annotationId: string,
    sourceRect?: WindowAnimationSourceRect,
  ) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [expandedByUser, dispatchExpanded] = useReducer(capsulesExpandedReducer, false);
  const items = useMemo(
    () => annotationDiscussionCapsuleItems(article, windows, userProfile, agents),
    [agents, article, windows, userProfile],
  );

  const isMany = items.length >= 5;
  const expanded = !isMany || expandedByUser;
  const itemIds = JSON.stringify(items.map((item) => item.annotationId));
  const currentCorner = useStableCallback(() => corner);
  const handleDock = useStableCallback(onDock);
  const positionLabel = useStableCallback((position: DiscussionDockCorner) =>
    t(`discussion.capsules.position.${position}`),
  );
  const bindDock = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        return bindDiscussionCapsuleDock(element, {
          corner: currentCorner(),
          onDock: handleDock,
          positionLabel,
        });
      }
    },
    [expanded, itemIds, currentCorner, handleDock, positionLabel],
  );

  if (windows.length === 0) return null;

  const content = !expanded ? (
    <div
      className="annotation-discussion-capsules is-collapsed"
      aria-label={t('discussion.capsules.minimized')}
    >
      <button
        className="annotation-discussion-capsules-toggle"
        type="button"
        aria-expanded="false"
        title={t('discussion.capsules.move')}
        onClick={() => dispatchExpanded({ type: 'expanded' })}
      >
        <HugeiconsIcon icon={BubbleChatIcon} aria-hidden="true" size={16} strokeWidth={1.8} />
        <span>{t('discussion.capsules.collapsed')}</span>
        <strong>{items.length}</strong>
        <HugeiconsIcon
          icon={DragDropVerticalIcon}
          className="annotation-discussion-capsules-grip"
          size={16}
          aria-hidden="true"
        />
      </button>
    </div>
  ) : (
    <section
      className="annotation-discussion-capsules is-expanded"
      aria-label={t('discussion.capsules.minimized')}
    >
      <div
        className="annotation-discussion-capsules-header"
        tabIndex={0}
        role="group"
        aria-label={t('discussion.capsules.move')}
        title={t('discussion.capsules.move')}
      >
        <span>{t('discussion.capsules.collapsed')}</span>
        <strong>{items.length}</strong>
        <HugeiconsIcon
          icon={DragDropVerticalIcon}
          className="annotation-discussion-capsules-grip"
          size={16}
          aria-hidden="true"
        />
        {isMany ? (
          <button
            className="annotation-discussion-capsules-collapse"
            type="button"
            aria-label={t('discussion.capsules.collapse')}
            aria-expanded="true"
            onClick={() => dispatchExpanded({ type: 'collapsed' })}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      <div className="annotation-discussion-capsule-list">
        {items.map((item, index) => (
          <button
            key={`${item.articleId}:${item.annotationId}`}
            className={['annotation-discussion-capsule', item.pending ? 'is-replying' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
            data-window-id={item.windowId}
            style={
              {
                '--capsule-accent': item.color || 'var(--app-interactive-link)',
                '--capsule-indent': `${Math.min(index, 2) * 9}px`,
                '--capsule-order': items.length - index,
              } as CSSProperties
            }
            title={t('discussion.capsules.open', { quote: item.quote })}
            onClick={(event) =>
              void onOpen?.(
                item.articleId,
                item.annotationId,
                elementWindowSourceRect(event.currentTarget),
              )
            }
          >
            <CapsuleQuote key={item.quote} quote={item.quote} />
            <span className="annotation-discussion-capsule-summary">
              <span className="annotation-discussion-capsule-meta">
                {t('discussion.capsules.summary', {
                  ideas: item.ideaCount,
                  replies: item.replyCount,
                })}
              </span>
              {item.assistants.length ? (
                <span
                  className="annotation-discussion-capsule-assistants"
                  aria-label={t('discussion.capsules.assistants')}
                >
                  {item.assistants.slice(0, 4).map((assistant) =>
                    assistant.avatar ? (
                      <img
                        key={assistant.key}
                        src={assistant.avatar}
                        alt={assistant.name}
                        title={assistant.name}
                      />
                    ) : (
                      <span key={assistant.key} title={assistant.name}>
                        {assistant.name.slice(0, 1)}
                      </span>
                    ),
                  )}
                </span>
              ) : null}
              {item.pending ? (
                <span className="annotation-discussion-capsule-replying">
                  {t('discussion.replying')}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div
      className="annotation-discussion-capsules-viewport"
      data-window-ids={items.map((item) => item.windowId).join(' ')}
      ref={bindDock}
    >
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((position) => (
        <div
          key={position}
          className="annotation-discussion-capsules-corner"
          data-corner={position}
          aria-hidden="true"
        />
      ))}
      <div className="annotation-discussion-capsules-landing" aria-hidden="true">
        <div className="annotation-discussion-capsules-outlines" />
        <span>{t('discussion.capsules.releaseToDock')}</span>
      </div>
      {content}
      <span className="sr-only" role="status" />
    </div>
  );
}

function CapsuleQuote({ quote }: { quote: string }) {
  return (
    <span className="annotation-discussion-capsule-title" ref={bindQuoteScroll}>
      <span className="annotation-discussion-capsule-quote-track">
        <span>{quote}</span>
        <span aria-hidden="true">{quote}</span>
      </span>
    </span>
  );
}

function bindQuoteScroll(element: HTMLSpanElement | null) {
  if (!element) return;
  const text = element.querySelector('.annotation-discussion-capsule-quote-track > span');
  if (!text) return;
  const measure = () => {
    const width = text.getBoundingClientRect().width;
    element.classList.toggle('is-overflowing', width > element.clientWidth + 1);
    element.style.setProperty('--quote-scroll-distance', `${-(width + 32)}px`);
    element.style.setProperty('--quote-scroll-duration', `${Math.max(8, (width + 32) / 24)}s`);
  };
  const visibilityChanged = () => element.classList.toggle('is-hidden', document.hidden);
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  observer.observe(text);
  document.addEventListener('visibilitychange', visibilityChanged);
  measure();
  visibilityChanged();
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', visibilityChanged);
  };
}

function capsulesExpandedReducer(
  _expanded: boolean,
  event: { type: 'expanded' } | { type: 'collapsed' },
) {
  return event.type === 'expanded';
}
