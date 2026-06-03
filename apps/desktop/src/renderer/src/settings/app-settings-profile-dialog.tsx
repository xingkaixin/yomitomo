import React from 'react';
import { Check, Save, Upload, User } from 'lucide-react';
import { sanitizeUsernameInput, userAnnotationColors, type UserDraft } from './app-settings';
import { readFileAsDataUrl } from '../app-utils';
import { AvatarImage, Field } from '../app-ui';
import type { SaveState } from '../app-types';
import { ColorPicker } from './app-settings-color-picker';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useSourceAwareDialogTransition, type DialogSourceRect } from '../app-dialog-transition';

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
  const dialogStyle = useSourceAwareDialogTransition(sourceRect);
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const selectedAnnotationColor = userAnnotationColors.includes(draft.annotationColor || '')
    ? draft.annotationColor || userAnnotationColors[0]
    : userAnnotationColors[0];

  React.useEffect(() => {
    if (!draft.annotationColor || userAnnotationColors.includes(draft.annotationColor)) return;
    onChange({ ...draft, annotationColor: userAnnotationColors[0] });
  }, [draft, onChange]);

  React.useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);

  return (
    <div
      className="user-profile-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="user-profile-dialog-title"
        aria-modal="true"
        className="user-profile-dialog source-aware-dialog"
        role="dialog"
        style={dialogStyle}
      >
        <header>
          <div className="user-profile-dialog-heading">
            <span>
              <User size={19} />
            </span>
            <div>
              <h2 id="user-profile-dialog-title">个人设置</h2>
              <p>配置想法和回复中使用的身份信息。</p>
            </div>
          </div>
        </header>

        <div className="user-profile-form">
          <div className="user-profile-avatar-row">
            <AvatarImage
              value={draft.avatar || ''}
              className="user-profile-avatar-preview"
              fallback={draft.nickname?.slice(0, 1) || '我'}
            />
            <ProfileAvatarEditor onChange={(avatar) => onChange({ ...draft, avatar })} />
          </div>
          <Field id="profile-nickname" description="想法和回复中展示的名称。" label="昵称">
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
            description="用于 @ 提及，支持文字、数字、下划线和短横线。"
            label="用户名"
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
          <Field className="col-span-2" label="批注颜色">
            <AnnotationColorPreview
              avatar={draft.avatar || ''}
              color={selectedAnnotationColor}
              nickname={draft.nickname || '我'}
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
              {saveError || '保存失败，请重试。'}
            </p>
          ) : null}
          <Button className="action-button" type="button" variant="secondary" onClick={onClose}>
            取消
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
      </section>
    </div>
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
  return (
    <div
      className="annotation-color-preview"
      style={{ '--annotation-color': color } as React.CSSProperties}
    >
      <div className="annotation-color-preview-text">
        <p>
          阅读时看到值得保留的句子，
          <span>可以用下划线轻轻标出来</span>，旁边会留下你的批注。
        </p>
      </div>
      <div className="annotation-color-preview-card">
        <AvatarImage value={avatar} className="size-8" fallback={nickname.slice(0, 1) || '我'} />
        <div>
          <strong>{nickname}</strong>
          <p>这里值得留一条自己的判断。</p>
        </div>
      </div>
    </div>
  );
}

function ProfileAvatarEditor({ onChange }: { onChange: (avatar: string) => void }) {
  async function loadFile(file: File | undefined) {
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
  }

  return (
    <div className="grid gap-3">
      <label className="upload-button">
        <Upload size={16} />
        上传头像
        <input
          accept="image/*"
          type="file"
          onChange={(event) => loadFile(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}
