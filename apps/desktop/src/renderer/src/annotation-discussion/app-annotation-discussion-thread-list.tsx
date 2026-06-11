import { useState } from 'react';
import { MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import type { PublicAgent, UserProfile } from '@yomitomo/shared';
import { commentPersona } from '@yomitomo/core';
import { useTranslation } from 'react-i18next';
import { AvatarBadge } from '@yomitomo/reader-ui/reader-component-primitives';
import { formatRelativeTime, type DiscussionThread } from './app-annotation-discussion-utils';
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

export function ThoughtListItem({
  agents,
  isDeleting,
  isSelected,
  onDelete,
  onPin,
  onSelect,
  thread,
  userProfile,
}: {
  agents: PublicAgent[];
  isDeleting: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onPin: () => void;
  onSelect: () => void;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const author = commentPersona(thread.root, userProfile, agents);
  const itemClassName = [
    'annotation-discussion-idea',
    isSelected ? 'is-selected' : '',
    thread.isPinned ? 'is-pinned' : '',
    thread.pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={itemClassName}>
      <button className="annotation-discussion-idea-main" type="button" onClick={onSelect}>
        <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
        <span>
          <strong>{author.nickname}</strong>
          <em>{thread.root.content}</em>
          <small>
            {t('discussion.replyMeta', {
              time: formatRelativeTime(thread.updatedAt),
              count: thread.replyCount,
            })}
            {thread.pending ? t('discussion.processingSuffix') : ''}
          </small>
        </span>
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <div className="annotation-discussion-idea-actions">
          <DropdownMenuTrigger asChild>
            <button
              className={menuOpen ? 'is-active' : ''}
              type="button"
              aria-label={t('discussion.moreThoughtActions')}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="annotation-discussion-idea-menu">
            <DropdownMenuItem asChild>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPin();
                  setMenuOpen(false);
                }}
              >
                {thread.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                <span>
                  {thread.isPinned ? t('discussion.unpinThought') : t('discussion.pinThought')}
                </span>
              </button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <button
                className="annotation-discussion-idea-delete"
                type="button"
                disabled={isDeleting}
                aria-label={t('discussion.deleteThoughtAria')}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
              >
                <Trash2 size={13} />
                <span>{t('discussion.deleteThought')}</span>
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </div>
      </DropdownMenu>
      {thread.isPinned ? (
        <span className="annotation-discussion-idea-pin-badge" aria-label={t('discussion.pinned')}>
          <Pin size={10} />
        </span>
      ) : null}
      <SettingsConfirmDialog
        cancelLabel={t('settings.confirm.cancel')}
        confirmLabel={t('discussion.deleteThoughtConfirm')}
        description={t('discussion.deleteThoughtConfirmDescription')}
        open={confirmOpen}
        title={t('discussion.deleteThoughtConfirmTitle')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </article>
  );
}
