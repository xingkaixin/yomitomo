import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';

// 文章卡片视图和列表视图共用同一确认状态和文案生成逻辑，避免两套删除行为漂移。
export function useArticleDeleteConfirm(title: string, onDelete: () => void) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dialog = (
    <SettingsConfirmDialog
      cancelLabel={t('settings.confirm.cancel')}
      confirmLabel={t('library.actions.deleteArticleConfirm')}
      description={t('library.actions.deleteArticleConfirmDescription')}
      open={confirmOpen}
      title={t('library.actions.deleteArticleConfirmTitle', { title })}
      onCancel={() => setConfirmOpen(false)}
      onConfirm={() => {
        setConfirmOpen(false);
        onDelete();
      }}
    />
  );

  return { dialog, requestDelete: () => setConfirmOpen(true) };
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
    <button
      className="library-item-delete"
      type="button"
      role="menuitem"
      aria-label={t('library.actions.deleteArticleAria', { title })}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
    >
      <Trash2 size={14} />
      <span>{t('library.actions.deleteArticle')}</span>
    </button>
  );
}
