import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Settings } from 'lucide-react';
import type {
  AppSettings,
  LibraryContentSourceId,
  LibraryContentSourcePreference,
} from '@yomitomo/shared';
import { AutoSaveStatus } from './app-settings-save-status';
import type { SaveState } from '../shell/app-types';
import { Field, PanelHeader } from '../shell/app-ui';
import {
  allLibraryContentSourceOptions,
  libraryContentSourcePreferences,
  setLibraryContentSourceEnabled,
} from '../reading-library/app-library-content-sources';

type ContentSourceDragSession = {
  cleanup: () => void;
  grabX: number;
  grabY: number;
  id: LibraryContentSourceId;
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
};

type ContentSourceDragFrame = {
  left: number;
  top: number;
  width: number;
};

export function GeneralSettings({
  settingsDraft,
  canSave,
  onSettingsChange,
  onSave,
  saveError,
  saveState,
}: {
  settingsDraft: AppSettings;
  canSave: boolean;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: (draft?: AppSettings) => void;
  saveError?: string;
  saveState: SaveState;
}) {
  const sourcePreferences = libraryContentSourcePreferences(settingsDraft);
  const [dragPreviewPreferences, setDragPreviewPreferences] = useState<
    LibraryContentSourcePreference[] | null
  >(null);
  const dragPreviewRef = useRef<LibraryContentSourcePreference[] | null>(null);
  const displayPreferences = dragPreviewPreferences || sourcePreferences;
  const sourceOptions = allLibraryContentSourceOptions(displayPreferences);
  const enabledSourceCount = sourceOptions.filter((option) => option.enabled).length;
  const [draggedSource, setDraggedSource] = useState<LibraryContentSourceId | null>(null);
  const [dragFrame, setDragFrame] = useState<ContentSourceDragFrame | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<ContentSourceDragSession | null>(null);
  const draggedOption = draggedSource
    ? sourceOptions.find((option) => option.value === draggedSource)
    : null;

  useEffect(() => {
    return () => {
      dragSessionRef.current?.cleanup();
    };
  }, []);

  function saveContentSources(nextSources: AppSettings['libraryContentSources']) {
    const nextDraft = {
      ...settingsDraft,
      libraryContentSources: nextSources,
    };
    onSettingsChange(nextDraft);
    onSave(nextDraft);
  }

  function toggleContentSource(option: (typeof sourceOptions)[number]) {
    if (option.enabled && enabledSourceCount <= 1) return;
    saveContentSources(
      setLibraryContentSourceEnabled(sourcePreferences, option.value, !option.enabled),
    );
  }

  function toggleContentSourceById(id: LibraryContentSourceId) {
    const option = sourceOptions.find((item) => item.value === id);
    if (option) toggleContentSource(option);
  }

  function finishContentSourceDrag(nextSources?: LibraryContentSourcePreference[]) {
    const session = dragSessionRef.current;
    session?.cleanup();
    document.body.style.userSelect = '';
    dragSessionRef.current = null;
    dragPreviewRef.current = null;
    setDraggedSource(null);
    setDragFrame(null);
    setDragPreviewPreferences(null);
    if (nextSources && !sameLibraryContentSourcePreferences(sourcePreferences, nextSources)) {
      saveContentSources(nextSources);
    }
  }

  function startContentSourcePointerDrag(
    event: React.PointerEvent<HTMLElement>,
    id: LibraryContentSourceId,
  ) {
    if (event.button !== 0 || ('isPrimary' in event && !event.isPrimary)) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const handlePointerMove = (moveEvent: PointerEvent) => moveContentSourceDrag(moveEvent);
    const handlePointerUp = (upEvent: PointerEvent) => commitContentSourceDrag(upEvent);
    const handlePointerCancel = (cancelEvent: PointerEvent) => cancelContentSourceDrag(cancelEvent);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    dragSessionRef.current = {
      cleanup: () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
      },
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      id,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
    };
  }

  function moveContentSourceDrag(event: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const movedDistance = Math.hypot(
      event.clientX - session.startX,
      event.clientY - session.startY,
    );
    if (!session.moved && movedDistance < 5) return;
    if (!session.moved) {
      session.moved = true;
      setDraggedSource(session.id);
      dragPreviewRef.current = sourcePreferences;
      setDragPreviewPreferences(sourcePreferences);
      document.body.style.userSelect = 'none';
    }
    setDragFrame({
      left: event.clientX - session.grabX,
      top: event.clientY - session.grabY,
      width: session.width,
    });

    const nextPreview = contentSourcePointerOrder(
      sourceMenuRef.current,
      dragPreviewRef.current || dragPreviewPreferences || sourcePreferences,
      session.id,
      event.clientX,
    );
    if (
      sameLibraryContentSourcePreferences(dragPreviewRef.current || sourcePreferences, nextPreview)
    )
      return;
    dragPreviewRef.current = nextPreview;
    setDragPreviewPreferences(nextPreview);
  }

  function commitContentSourceDrag(event: Pick<PointerEvent, 'pointerId'>) {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const nextSources = dragPreviewRef.current || dragPreviewPreferences || sourcePreferences;
    const shouldToggle = !session.moved;
    finishContentSourceDrag(session.moved ? nextSources : undefined);
    if (shouldToggle) toggleContentSourceById(session.id);
  }

  function cancelContentSourceDrag(event: Pick<PointerEvent, 'pointerId'>) {
    const session = dragSessionRef.current;
    if (session?.pointerId === event.pointerId) finishContentSourceDrag();
  }

  return (
    <div className="settings-panel collection-settings-panel">
      <PanelHeader
        icon={<Settings size={20} />}
        title="通用"
        description="控制导入文章时的本地保存行为与阅读库入口显示。"
        action={
          <AutoSaveStatus
            error={saveError}
            state={saveState}
            onRetry={canSave ? () => onSave() : undefined}
          />
        }
      />
      <div className="settings-form-grid max-w-3xl">
        <Field
          id="general-save-images"
          className="col-span-2"
          description="采集文章时，将正文中的图片持久化保存，减少原站图片失效、防盗链或链接变更导致的阅读断裂。"
          label="保存原文图片"
        >
          <label className="settings-toggle-card" htmlFor="general-save-images">
            <span className="settings-toggle-main">
              <span className="settings-toggle-icon">
                <ImageIcon size={17} />
              </span>
              <span>
                <strong>采集文章时保存正文图片</strong>
                <em>
                  {settingsDraft.saveArticleImages
                    ? '已开启。新采集文章中的图片会随文章一起保存。'
                    : '已关闭。文章图片将保留原始链接。'}
                </em>
              </span>
            </span>
            <input
              id="general-save-images"
              type="checkbox"
              checked={Boolean(settingsDraft.saveArticleImages)}
              onChange={(event) => {
                const nextDraft = {
                  ...settingsDraft,
                  saveArticleImages: event.target.checked,
                };
                onSettingsChange(nextDraft);
                onSave(nextDraft);
              }}
            />
            <span className="settings-toggle-switch" aria-hidden="true" />
          </label>
        </Field>
        <Field
          id="library-content-sources"
          className="library-content-source-card-field col-span-2"
          label="阅读库入口"
          description="点按菜单项切换明灭，拖拽菜单项调整在功能菜单里的顺序。"
        >
          <div
            className="library-source-tabs library-content-source-menu"
            ref={sourceMenuRef}
            role="list"
          >
            {sourceOptions.map((option) => {
              const disableBlocked = option.enabled && enabledSourceCount <= 1;
              return (
                <div
                  className={[
                    'library-content-source-menu-item',
                    option.enabled ? 'is-enabled' : 'is-disabled',
                    draggedSource === option.value ? 'is-dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={option.value}
                  role="listitem"
                >
                  <div
                    className="library-content-source-menu-button"
                    data-library-source-card={option.value}
                    role="button"
                    tabIndex={0}
                    aria-disabled={disableBlocked || undefined}
                    aria-pressed={option.enabled}
                    aria-label={`切换${option.label}入口`}
                    onPointerDown={(event) => startContentSourcePointerDrag(event, option.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      toggleContentSource(option);
                    }}
                  >
                    <span>{option.label}</span>
                    <span className="library-content-source-menu-underline" aria-hidden="true" />
                  </div>
                </div>
              );
            })}
            {draggedOption && dragFrame ? (
              <div
                aria-hidden="true"
                className={[
                  'library-content-source-menu-item',
                  'is-floating-drag',
                  draggedOption.enabled ? 'is-enabled' : 'is-disabled',
                ].join(' ')}
                style={
                  {
                    left: dragFrame.left,
                    top: dragFrame.top,
                    width: dragFrame.width,
                  } as React.CSSProperties
                }
              >
                <span className="library-content-source-menu-button">
                  <span>{draggedOption.label}</span>
                  <span className="library-content-source-menu-underline" aria-hidden="true" />
                </span>
              </div>
            ) : null}
            <div className="library-content-source-menu-item is-coming-soon" role="listitem">
              <span className="library-content-source-menu-button" aria-disabled="true">
                <span>更多类型，敬请期待</span>
              </span>
            </div>
          </div>
        </Field>
      </div>
    </div>
  );
}

function contentSourcePointerOrder(
  row: HTMLElement | null,
  preferences: LibraryContentSourcePreference[],
  draggedId: LibraryContentSourceId,
  clientX: number,
) {
  if (!row) return preferences;
  const mids = Array.from(row.querySelectorAll<HTMLElement>('[data-library-source-card]'))
    .filter((element) => element.dataset.librarySourceCard !== draggedId)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left + rect.width / 2;
    });
  const targetIndex = mids.filter((mid) => clientX > mid).length;
  const currentIndex = preferences.findIndex((preference) => preference.id === draggedId);
  if (currentIndex < 0 || targetIndex === currentIndex) return preferences;
  const next = [...preferences];
  const [dragged] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function sameLibraryContentSourcePreferences(
  left: LibraryContentSourcePreference[],
  right: LibraryContentSourcePreference[],
) {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) => item.id === right[index]?.id && item.enabled === right[index]?.enabled,
  );
}
