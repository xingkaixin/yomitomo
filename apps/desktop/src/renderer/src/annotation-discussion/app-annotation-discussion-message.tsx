import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon } from '@hugeicons/core-free-icons';
import { useMemo, useReducer } from 'react';
import type { Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import { commentPersona } from '@yomitomo/core';
import { useTranslation } from 'react-i18next';
import { AvatarBadge, ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { useStreamingWordReveal, wordRevealAccent } from '../components/ui/word-reveal';
import { AssistantRuntimeProgressList } from '../shell/app-assistant-runtime-progress';
import { formatAbsoluteTime, formatRelativeTime } from './app-annotation-discussion-utils';
import { renderDiscussionMessageMarkdown } from './app-annotation-discussion-mention-chips';
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';

export type DiscussionGroupPosition = 'single' | 'first' | 'mid' | 'last';

const replyDots = Array.from({ length: 16 }, (_, index) => index);
// Only messages created this recently play the send animation, so reopening a thread stays still.
const freshMessageMs = 3000;

export function DiscussionMessage({
  agents,
  groupPosition,
  isDeleting,
  message,
  onDelete,
  showIdentity,
  userProfile,
}: {
  agents: PublicAgent[];
  groupPosition: DiscussionGroupPosition;
  isDeleting: boolean;
  message: Comment;
  onDelete?: () => void;
  showIdentity: boolean;
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const [{ confirmOpen, entering, leaving }, dispatch] = useReducer(
    messageReducer,
    message,
    initialMessageState,
  );
  const isUser = message.author.kind === 'user';
  const author = commentPersona(message, userProfile, agents);
  const html = useMemo(
    () => renderDiscussionMessageMarkdown(message.content, agents, message.author),
    [agents, message.author, message.content],
  );
  const streaming = Boolean(message.pending) && !isUser;
  const waiting = streaming && !message.content.trim();
  const revealRef = useStreamingWordReveal(message.id, streaming);
  const groupStart = groupPosition === 'single' || groupPosition === 'first';
  const className = [
    'annotation-discussion-bubble-row',
    isUser ? 'is-user' : 'is-assistant',
    `is-${groupPosition}`,
    streaming ? 'is-pending' : '',
    entering ? 'is-entering' : '',
    leaving ? 'is-leaving' : '',
    isDeleting ? 'is-deleting' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={className}
      style={streaming ? wordRevealAccent(author.color) : undefined}
      onAnimationEnd={(event) => {
        if (!leaving || event.target !== event.currentTarget) return;
        dispatch({ type: 'leaveFinished' });
        onDelete?.();
      }}
    >
      {showIdentity && groupStart ? (
        <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
      ) : null}
      <div className="annotation-discussion-bubble-body">
        {showIdentity && groupStart ? (
          <header>
            <strong>{author.nickname}</strong>
            {streaming ? (
              <em>{t('discussion.replying')}</em>
            ) : (
              <ReaderTooltip content={formatAbsoluteTime(message.createdAt)}>
                <time dateTime={message.createdAt} tabIndex={0}>
                  {formatRelativeTime(message.createdAt)}
                </time>
              </ReaderTooltip>
            )}
          </header>
        ) : null}
        <AssistantRuntimeProgressList progress={message.assistantProgress} />
        {waiting ? (
          <span
            className="annotation-discussion-reply-dots"
            role="img"
            aria-label={`${author.nickname} ${t('discussion.replying')}`}
          >
            {replyDots.map((dot) => (
              <i key={dot} />
            ))}
          </span>
        ) : (
          <div className="annotation-discussion-bubble">
            <div
              key={html}
              ref={revealRef}
              className="annotation-discussion-markdown"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        )}
      </div>
      {onDelete ? (
        <button
          className="annotation-discussion-message-delete"
          type="button"
          disabled={isDeleting || leaving}
          aria-label={t('discussion.deleteReplyAria')}
          onClick={() => dispatch({ type: 'deleteRequested' })}
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} />
        </button>
      ) : null}
      <SettingsConfirmDialog
        cancelLabel={t('settings.confirm.cancel')}
        confirmLabel={t('discussion.deleteReplyConfirm')}
        description={t('discussion.deleteReplyConfirmDescription')}
        open={confirmOpen}
        title={t('discussion.deleteReplyConfirmTitle')}
        onCancel={() => dispatch({ type: 'deleteDismissed' })}
        onConfirm={() => dispatch({ type: 'deleteConfirmed' })}
      />
    </article>
  );
}

type MessageState = { confirmOpen: boolean; entering: boolean; leaving: boolean };

function initialMessageState(message: Comment): MessageState {
  return {
    confirmOpen: false,
    entering:
      message.author.kind === 'user' && Date.now() - Date.parse(message.createdAt) < freshMessageMs,
    leaving: false,
  };
}

type DiscussionMessageEvent =
  | { type: 'deleteConfirmed' }
  | { type: 'deleteDismissed' }
  | { type: 'deleteRequested' }
  | { type: 'leaveFinished' };

// The bubble plays its exit before the delete is sent, then stays collapsed while it runs.
function messageReducer(state: MessageState, event: DiscussionMessageEvent): MessageState {
  switch (event.type) {
    case 'deleteConfirmed':
      return { ...state, confirmOpen: false, leaving: true };
    case 'deleteDismissed':
      return { ...state, confirmOpen: false };
    case 'deleteRequested':
      return { ...state, confirmOpen: true };
    case 'leaveFinished':
      return { ...state, leaving: false };
  }
}
