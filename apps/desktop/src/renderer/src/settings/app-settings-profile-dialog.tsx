import React from 'react';
import { Check, Save, Upload, User } from 'lucide-react';
import { sanitizeUsernameInput, userAnnotationColors, type UserDraft } from './app-settings';
import { readFileAsDataUrl } from '../shell/app-utils';
import { AvatarImage, Field } from '../shell/app-ui';
import type { SaveState } from '../shell/app-types';
import { ColorPicker } from './app-settings-color-picker';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  useSourceAwareDialogTransition,
  type DialogSourceRect,
} from '../shell/app-dialog-transition';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';

export function UserProfileSettingsDialog({
  draft,
  canSave,
  onChange,
  onClose,
  onSave,
  saveError,
  saveState,
  sourceRect,
}: {
  draft: UserDraft;
  canSave: boolean;
  onChange: (draft: UserDraft) => void;
  onClose: () => void;
  onSave: () => void;
  saveError?: string;
  saveState: SaveState;
  sourceRect?: DialogSourceRect;
}) {
  const { t } = useTranslation();
  const dialogStyle = useSourceAwareDialogTransition(sourceRect);
  const saveLabel =
    saveState === 'saving'
      ? t('settings.profile.saving')
      : saveState === 'saved'
        ? t('settings.profile.saved')
        : t('settings.profile.save');
  const selectedAnnotationColor = userAnnotationColors.includes(draft.annotationColor || '')
    ? draft.annotationColor || userAnnotationColors[0]
    : userAnnotationColors[0];

  React.useEffect(() => {
    if (!draft.annotationColor || userAnnotationColors.includes(draft.annotationColor)) return;
    onChange({ ...draft, annotationColor: userAnnotationColors[0] });
  }, [draft, onChange]);

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogPortal>
        <DialogOverlay className="user-profile-dialog-overlay">
          <DialogContent className="user-profile-dialog source-aware-dialog" style={dialogStyle}>
            <header>
              <div className="user-profile-dialog-heading">
                <span>
                  <User size={19} />
                </span>
                <div>
                  <DialogTitle id="user-profile-dialog-title">
                    {t('settings.profile.title')}
                  </DialogTitle>
                  <DialogDescription>{t('settings.profile.description')}</DialogDescription>
                </div>
              </div>
            </header>

            <div className="user-profile-form">
              <div className="user-profile-avatar-row">
                <AvatarImage
                  value={draft.avatar || ''}
                  className="user-profile-avatar-preview"
                  fallback={draft.nickname?.slice(0, 1) || t('settings.profile.selfFallback')}
                />
                <ProfileAvatarEditor onChange={(avatar) => onChange({ ...draft, avatar })} />
              </div>
              <Field
                id="profile-nickname"
                description={t('settings.profile.nicknameDescription')}
                label={t('settings.profile.nickname')}
              >
                <Input
                  id="profile-nickname"
                  name="nickname"
                  autoComplete="off"
                  value={draft.nickname || ''}
                  onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
                />
              </Field>
              <Field
                id="profile-username"
                description={t('settings.profile.usernameDescription')}
                label={t('settings.profile.username')}
              >
                <Input
                  id="profile-username"
                  name="username"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.username || ''}
                  onChange={(event) =>
                    onChange({ ...draft, username: sanitizeUsernameInput(event.target.value) })
                  }
                />
              </Field>
              <Field className="col-span-2" label={t('settings.profile.annotationColor')}>
                <AnnotationColorPreview
                  avatar={draft.avatar || ''}
                  color={selectedAnnotationColor}
                  nickname={draft.nickname || t('settings.profile.selfFallback')}
                />
                <ColorPicker
                  colors={userAnnotationColors}
                  value={selectedAnnotationColor}
                  onChange={(annotationColor) => onChange({ ...draft, annotationColor })}
                />
              </Field>
            </div>

            <footer>
              {saveState === 'error' ? (
                <p className="settings-inline-error" role="alert">
                  {saveError || t('settings.profile.saveFailed')}
                </p>
              ) : null}
              <Button className="action-button" type="button" variant="secondary" onClick={onClose}>
                {t('settings.profile.cancel')}
              </Button>
              <Button
                className={
                  saveState === 'saved'
                    ? 'action-button save-action is-saved'
                    : 'action-button save-action'
                }
                disabled={!canSave}
                type="button"
                onClick={onSave}
              >
                {saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}
                {saveLabel}
              </Button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function AnnotationColorPreview({
  avatar,
  color,
  nickname,
}: {
  avatar: string;
  color: string;
  nickname: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="annotation-color-preview"
      style={{ '--annotation-color': color } as React.CSSProperties}
    >
      <div className="annotation-color-preview-text">
        <p>
          {t('settings.profile.previewTextBefore')}
          <span>{t('settings.profile.previewTextHighlight')}</span>
          {t('settings.profile.previewTextAfter')}
        </p>
      </div>
      <div className="annotation-color-preview-card">
        <AvatarImage
          value={avatar}
          className="size-8"
          fallback={nickname.slice(0, 1) || t('settings.profile.selfFallback')}
        />
        <div>
          <strong>{nickname}</strong>
          <p>{t('settings.profile.previewComment')}</p>
        </div>
      </div>
    </div>
  );
}

function ProfileAvatarEditor({ onChange }: { onChange: (avatar: string) => void }) {
  const { t } = useTranslation();

  async function loadFile(file: File | undefined) {
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
  }

  return (
    <div className="grid gap-3">
      <label className="upload-button">
        <Upload size={16} />
        {t('settings.profile.uploadAvatar')}
        <input
          accept="image/*"
          type="file"
          onChange={(event) => loadFile(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}
