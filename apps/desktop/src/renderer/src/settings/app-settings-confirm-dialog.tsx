import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';

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

  if (!open || typeof document === 'undefined') return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogPortal>
        <DialogOverlay className="settings-confirm-dialog-overlay">
          <DialogContent className="settings-confirm-dialog">
            <header>
              <span className="settings-confirm-dialog-icon" aria-hidden="true">
                <AlertTriangle size={20} />
              </span>
              <div>
                <DialogTitle id="settings-confirm-dialog-title">{title}</DialogTitle>
                <DialogDescription id="settings-confirm-dialog-description">
                  {description}
                </DialogDescription>
              </div>
            </header>
            <footer>
              <Button
                className="action-button"
                type="button"
                variant="secondary"
                onClick={onCancel}
              >
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
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
