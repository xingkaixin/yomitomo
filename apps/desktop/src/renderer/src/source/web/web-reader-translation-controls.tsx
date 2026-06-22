import { Eye, EyeOff, Languages, RefreshCw, Trash2 } from 'lucide-react';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';

export type TranslationConfirmAction = 'translate' | 'retranslate' | 'delete';

type ReaderTranslationLabels = {
  deleteTranslation: string;
  hideTranslation: string;
  retranslateArticle: string;
  showTranslation: string;
  translateArticle: string;
};

export function ReaderTranslationToolbarButton({
  busy,
  hasTranslation,
  labels,
  menuOpen,
  visible,
  onConfirm,
  onMenuOpenChange,
  onSetVisible,
}: {
  busy: boolean;
  hasTranslation: boolean;
  labels: ReaderTranslationLabels;
  menuOpen: boolean;
  visible: boolean;
  onConfirm: (action: TranslationConfirmAction) => void;
  onMenuOpenChange: (open: boolean) => void;
  onSetVisible: (visible: boolean) => void;
}) {
  if (!hasTranslation) {
    return (
      <ReaderTooltip content={labels.translateArticle} side="bottom">
        <button
          aria-label={labels.translateArticle}
          className={['reader-icon-button', busy ? 'is-busy' : ''].filter(Boolean).join(' ')}
          disabled={busy}
          type="button"
          onClick={() => onConfirm('translate')}
        >
          {busy ? <RefreshCw size={18} /> : <Languages size={18} />}
        </button>
      </ReaderTooltip>
    );
  }

  const buttonLabel = visible ? labels.hideTranslation : labels.showTranslation;
  return (
    <Popover open={menuOpen} onOpenChange={onMenuOpenChange}>
      <ReaderTooltip content={buttonLabel} side="bottom">
        <PopoverTrigger asChild>
          <button
            aria-label={buttonLabel}
            className={['reader-icon-button', visible ? 'is-active' : '', busy ? 'is-busy' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
          >
            {busy ? <RefreshCw size={18} /> : visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </PopoverTrigger>
      </ReaderTooltip>
      <PopoverContent align="end" className="reader-translation-menu" side="bottom" sideOffset={10}>
        <button
          aria-label={buttonLabel}
          type="button"
          onClick={() => {
            onSetVisible(!visible);
            onMenuOpenChange(false);
          }}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          <span>{buttonLabel}</span>
        </button>
        <button
          aria-label={labels.retranslateArticle}
          disabled={busy}
          type="button"
          onClick={() => {
            onMenuOpenChange(false);
            onConfirm('retranslate');
          }}
        >
          <RefreshCw size={15} />
          <span>{labels.retranslateArticle}</span>
        </button>
        <button
          aria-label={labels.deleteTranslation}
          className="is-danger"
          disabled={busy}
          type="button"
          onClick={() => {
            onMenuOpenChange(false);
            onConfirm('delete');
          }}
        >
          <Trash2 size={15} />
          <span>{labels.deleteTranslation}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

type ReaderTranslationConfirmLabels = {
  cancel: string;
  confirmDeleteTranslation: string;
  confirmDeleteTranslationDescription: string;
  confirmDeleteTranslationTitle: string;
  confirmRetranslate: string;
  confirmRetranslateDescription: string;
  confirmRetranslateTitle: string;
  confirmTranslate: string;
  confirmTranslateDescription: string;
  confirmTranslateTitle: string;
};

export function ReaderTranslationConfirmDialog({
  action,
  annotationNotice,
  labels,
  onClose,
  onConfirm,
}: {
  action: TranslationConfirmAction | null;
  annotationNotice: string;
  labels: ReaderTranslationConfirmLabels;
  onClose: () => void;
  onConfirm: (action: TranslationConfirmAction) => Promise<void>;
}) {
  const copy =
    action === 'delete'
      ? {
          confirm: labels.confirmDeleteTranslation,
          description: labels.confirmDeleteTranslationDescription,
          title: labels.confirmDeleteTranslationTitle,
        }
      : action === 'retranslate'
        ? {
            confirm: labels.confirmRetranslate,
            description: labels.confirmRetranslateDescription,
            title: labels.confirmRetranslateTitle,
          }
        : {
            confirm: labels.confirmTranslate,
            description: labels.confirmTranslateDescription,
            title: labels.confirmTranslateTitle,
          };
  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogPortal>
        <DialogOverlay className="reader-translation-confirm-overlay">
          <DialogContent
            aria-describedby="reader-translation-confirm-description"
            aria-labelledby="reader-translation-confirm-title"
            className="reader-translation-confirm"
          >
            <DialogTitle id="reader-translation-confirm-title">{copy.title}</DialogTitle>
            <DialogDescription id="reader-translation-confirm-description">
              {annotationNotice ? `${copy.description} ${annotationNotice}` : copy.description}
            </DialogDescription>
            <div className="reader-translation-confirm-actions">
              <button type="button" onClick={onClose}>
                {labels.cancel}
              </button>
              <button
                className={action === 'delete' ? 'is-danger' : 'is-primary'}
                disabled={!action}
                type="button"
                onClick={() => {
                  if (action) void onConfirm(action);
                }}
              >
                {copy.confirm}
              </button>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
