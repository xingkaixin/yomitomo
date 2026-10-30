import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon } from '@hugeicons/core-free-icons';
import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';
import { DropdownMenuItem } from '../components/ui/dropdown-menu';

// 文章卡片视图和列表视图共用同一确认状态和文案生成逻辑，避免两套删除行为漂移。
export function useArticleDeleteConfirm(title: string, onDelete: () => void) {
  const { t } = useTranslation();
  const [confirmOpen, dispatch] = useReducer(deleteConfirmReducer, false);

  const dialog = (
    <SettingsConfirmDialog
      cancelLabel={t('settings.confirm.cancel')}
      confirmLabel={t('library.actions.deleteArticleConfirm')}
      description={t('library.actions.deleteArticleConfirmDescription')}
      open={confirmOpen}
      title={t('library.actions.deleteArticleConfirmTitle', { title })}
      onCancel={() => dispatch({ type: 'dismissed' })}
      onConfirm={() => {
        dispatch({ type: 'confirmed' });
        onDelete();
      }}
    />
  );

  return { dialog, requestDelete: () => dispatch({ type: 'requested' }) };
}

type DeleteConfirmEvent = { type: 'requested' } | { type: 'dismissed' } | { type: 'confirmed' };

function deleteConfirmReducer(_open: boolean, event: DeleteConfirmEvent) {
  return event.type === 'requested';
}

export function ArticleDeleteMenuItem({
  title,
  onSelect,
}: {
  title: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenuItem asChild>
      <button
        className="library-item-delete"
        type="button"
        aria-label={t('library.actions.deleteArticleAria', { title })}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
        }}
      >
        <HugeiconsIcon icon={Delete02Icon} size={14} />
        <span>{t('library.actions.deleteArticle')}</span>
      </button>
    </DropdownMenuItem>
  );
}
