import { Trash2 } from 'lucide-react';
import type { Comment, UserProfile } from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import { commentPersona } from '@yomitomo/core';
import { AvatarBadge, ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { AssistantRuntimeProgressList } from '../shell/app-assistant-runtime-progress';
import { formatAbsoluteTime, formatRelativeTime } from './app-annotation-discussion-utils';
import { LongPressDeleteButton } from './app-annotation-discussion-thread-list';

export function DiscussionMessage({
  isDeleting,
  message,
  onDelete,
  userProfile,
}: {
  isDeleting: boolean;
  message: Comment;
  onDelete: () => void;
  userProfile: UserProfile;
}) {
  const author = commentPersona(message, userProfile, []);
  const html = renderMarkdown(message.content);
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
          {message.pending ? <em>回复中</em> : null}
          <LongPressDeleteButton
            className="annotation-discussion-message-delete"
            disabled={isDeleting}
            label="长按删除回复"
            onDelete={onDelete}
          >
            <Trash2 size={13} />
          </LongPressDeleteButton>
        </header>
        <AssistantRuntimeProgressList progress={message.assistantProgress} />
        <div
          className="annotation-discussion-markdown"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </article>
  );
}
