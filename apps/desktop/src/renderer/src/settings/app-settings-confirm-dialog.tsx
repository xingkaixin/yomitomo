import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

export function SettingsConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  open,
  title,
  onCancel,
  onConfirm,
}: {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCancel, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="settings-confirm-dialog-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        aria-describedby="settings-confirm-dialog-description"
        aria-labelledby="settings-confirm-dialog-title"
        aria-modal="true"
        className="settings-confirm-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="settings-confirm-dialog-icon" aria-hidden="true">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 id="settings-confirm-dialog-title">{title}</h2>
            <p id="settings-confirm-dialog-description">{description}</p>
          </div>
        </header>
        <footer>
          <Button className="action-button" type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel || t('settings.confirm.cancel')}
          </Button>
          <Button
            className="action-button settings-confirm-danger-action"
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
