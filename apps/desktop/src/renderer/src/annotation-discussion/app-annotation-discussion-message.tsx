import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import { commentPersona } from '@yomitomo/core';
import { useTranslation } from 'react-i18next';
import { AvatarBadge, ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { AssistantRuntimeProgressList } from '../shell/app-assistant-runtime-progress';
import { formatAbsoluteTime, formatRelativeTime } from './app-annotation-discussion-utils';
import { renderDiscussionMessageMarkdown } from './app-annotation-discussion-mention-chips';
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';

export function DiscussionMessage({
  agents,
  isDeleting,
  message,
  onDelete,
  userProfile,
}: {
  agents: PublicAgent[];
  isDeleting: boolean;
  message: Comment;
  onDelete: () => void;
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const author = commentPersona(message, userProfile, agents);
  const html = useMemo(
    () => renderDiscussionMessageMarkdown(message.content, agents, message.author),
    [agents, message.author, message.content],
  );
  const className = [
    'annotation-discussion-message',
    message.author === 'user' ? 'is-user' : 'is-assistant',
    message.pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
      <div className="annotation-discussion-message-bubble">
        <header>
          <strong>{author.nickname}</strong>
          <ReaderTooltip content={formatAbsoluteTime(message.createdAt)}>
            <time dateTime={message.createdAt} tabIndex={0}>
              {formatRelativeTime(message.createdAt)}
            </time>
          </ReaderTooltip>
          {message.pending ? <em>{t('discussion.replying')}</em> : null}
          <button
            className="annotation-discussion-message-delete"
            type="button"
            disabled={isDeleting}
            aria-label={t('discussion.deleteReplyAria')}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={13} />
          </button>
        </header>
        <AssistantRuntimeProgressList progress={message.assistantProgress} />
        <div
          className="annotation-discussion-markdown"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <SettingsConfirmDialog
        cancelLabel={t('settings.confirm.cancel')}
        confirmLabel={t('discussion.deleteReplyConfirm')}
        description={t('discussion.deleteReplyConfirmDescription')}
        open={confirmOpen}
        title={t('discussion.deleteReplyConfirmTitle')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </article>
  );
}
