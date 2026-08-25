import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  CircleArrowUp01Icon,
  CircleOffIcon,
  Edit01Icon,
  Refresh01Icon,
  SparklesIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import './app-update-dialog.css';
import type {
  AppSettingsPatch,
  DesktopStore,
  ReleaseNoteHighlight,
  ReleaseNoteHighlightType,
} from '@yomitomo/shared';
import { normalizeUiLanguage, selectHighlights, shouldShowAfterUpdate } from '@yomitomo/shared';
import type { AppUpdateProgress, AppUpdateState } from '../../../app-update-types';
import { resolveAppThemeId, themeRegistry } from '../theme/app-theme';
import coverLighterImage from '../assets/update/updater-cover-lighter.webp';
import coverDarkerImage from '../assets/update/updater-cover-darker.webp';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '../components/ui/dialog';
import { getDesktopApi } from './app-desktop-api';

type ReleaseDialogScene = 'before-update' | 'after-update';

type DownloadStatus = 'idle' | 'downloading' | 'error' | 'downloaded';

type ActiveReleaseDialog = {
  scene: ReleaseDialogScene;
  version: string;
  highlights: ReleaseNoteHighlight[];
};

const TYPE_ICON: Record<ReleaseNoteHighlightType, IconSvgElement> = {
  new: SparklesIcon,
  changed: Refresh01Icon,
  deprecated: CircleOffIcon,
  fixed: Wrench01Icon,
};

// 容器：负责 A/B 触发时机与文案数据获取，渲染纯展示的 View。
// 共享状态来自父级 useAppUpdateState，弹窗不再单独订阅 onUpdateStatus，避免重复订阅与状态割裂。
// B（更新后）：启动比对 lastSeenVersion 与当前版本，命中则读本地文案并弹窗，随后推进 lastSeenVersion。
// A（更新前）：手动检查命中即弹；自动检查命中只点亮常驻入口，用户从 header 主动请求时再弹（openRequest）。
export function UpdateReleaseDialog({
  store,
  updateState,
  openRequest,
  onSaveSettings,
}: {
  store: DesktopStore;
  updateState: AppUpdateState | null;
  openRequest: number;
  onSaveSettings: (settings: AppSettingsPatch) => Promise<DesktopStore>;
}) {
  const { i18n } = useTranslation();
  const [version, setVersion] = useState('');
  const [dialog, setDialog] = useState<ActiveReleaseDialog | null>(null);
  const afterUpdateHandledRef = useRef(false);
  const handledManualRef = useRef<string | null>(null);
  const handledDownloadedRef = useRef<string | null>(null);
  const settingsRef = useRef(store.settings);
  settingsRef.current = store.settings;
  const updateStateRef = useRef(updateState);
  updateStateRef.current = updateState;
  const languageRef = useRef(i18n.language);
  languageRef.current = i18n.language;

  useEffect(() => {
    void getDesktopApi()
      .app.getInfo()
      .then((info) => setVersion(info.desktopVersion));
  }, []);

  // 版本号和下载决策是必需 UI，远程文案是可选补充：先开弹窗，文案到了再补，
  // 且只在同一 scene 与版本仍打开时补，late response 不重开已关闭的弹窗。
  const openBeforeUpdate = useCallback((targetVersion: string) => {
    setDialog({ scene: 'before-update', version: targetVersion, highlights: [] });
    void getDesktopApi()
      .updates.getReleaseNote({
        version: targetVersion,
        source: 'remote',
        language: normalizeUiLanguage(languageRef.current),
      })
      .then((note) => {
        const highlights = note ? selectHighlights(note, 'before-update') : [];
        if (highlights.length === 0) return;
        setDialog((current) =>
          current?.scene === 'before-update' && current.version === targetVersion
            ? { ...current, highlights }
            : current,
        );
      })
      .catch(() => undefined);
  }, []);

  // B：每次启动只判定一次。无论是否弹窗，都把 lastSeenVersion 推进到当前版本，避免下次误判。
  useEffect(() => {
    if (afterUpdateHandledRef.current || !version) return;
    afterUpdateHandledRef.current = true;
    const lastSeenVersion = settingsRef.current.lastSeenVersion;
    const show = shouldShowAfterUpdate(lastSeenVersion, version);
    if (lastSeenVersion !== version) {
      void onSaveSettings({ ...settingsRef.current, lastSeenVersion: version });
    }
    if (!show) return;
    void getDesktopApi()
      .updates.getReleaseNote({
        version,
        source: 'local',
        language: normalizeUiLanguage(i18n.language),
      })
      .then((note) => {
        setDialog({
          scene: 'after-update',
          version,
          highlights: note ? selectHighlights(note, 'after-update') : [],
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language, version]);

  // A：手动检查命中即弹。以 checkedAt 去重，保证同一次命中只弹一次、再次手动检查会重新弹。
  useEffect(() => {
    if (updateState?.status !== 'available' || !updateState.availableVersion) return;
    if (updateState.trigger !== 'manual') return;
    const dedupeKey = updateState.checkedAt ?? updateState.availableVersion;
    if (handledManualRef.current === dedupeKey) return;
    handledManualRef.current = dedupeKey;
    openBeforeUpdate(updateState.availableVersion);
  }, [updateState, openBeforeUpdate]);

  // 用户从 header「有新版本」主动请求时打开当前更新，无论正在等待、下载还是已就绪。
  useEffect(() => {
    if (openRequest === 0) return;
    const state = updateStateRef.current;
    if (!state?.availableVersion || !canOpenUpdateDialog(state.status)) return;
    openBeforeUpdate(state.availableVersion);
  }, [openRequest, openBeforeUpdate]);

  useEffect(() => {
    if (updateState?.status !== 'downloaded' || !updateState.availableVersion) return;
    const dedupeKey = updateState.checkedAt ?? updateState.availableVersion;
    if (handledDownloadedRef.current === dedupeKey) return;
    handledDownloadedRef.current = dedupeKey;
    if (dialog?.scene === 'before-update' && dialog.version === updateState.availableVersion)
      return;
    openBeforeUpdate(updateState.availableVersion);
  }, [dialog, openBeforeUpdate, updateState]);

  if (!dialog) return null;

  const downloadStatus: DownloadStatus =
    dialog.scene === 'before-update' && updateState?.status === 'downloading'
      ? 'downloading'
      : dialog.scene === 'before-update' && updateState?.status === 'download-error'
        ? 'error'
        : dialog.scene === 'before-update' && updateState?.status === 'downloaded'
          ? 'downloaded'
          : 'idle';

  const handlePrimary = () => {
    if (dialog.scene === 'after-update') {
      setDialog(null);
      return;
    }
    // 下载完成停留在「重启安装」态；点击触发安装。其余情况触发下载，下载进度在弹窗内推进，不关闭弹窗。
    if (downloadStatus === 'downloaded') {
      void getDesktopApi().updates.install();
      return;
    }
    void getDesktopApi().updates.download();
  };

  const tone = themeRegistry[resolveAppThemeId(document.documentElement.dataset.theme)].meta.tone;
  const coverImage = tone === 'dark' ? coverDarkerImage : coverLighterImage;

  return (
    <UpdateReleaseDialogView
      scene={dialog.scene}
      version={dialog.version}
      highlights={dialog.highlights}
      coverImage={coverImage}
      downloadStatus={downloadStatus}
      downloadProgress={updateState?.progress}
      onPrimary={handlePrimary}
      onSecondary={() => setDialog(null)}
    />
  );
}

export function UpdateReleaseDialogView({
  scene,
  version,
  highlights,
  coverImage,
  downloadStatus = 'idle',
  downloadProgress,
  onPrimary,
  onSecondary,
}: {
  scene: ReleaseDialogScene;
  version: string;
  highlights: ReleaseNoteHighlight[];
  coverImage?: string;
  downloadStatus?: DownloadStatus;
  downloadProgress?: AppUpdateProgress;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isAfter = scene === 'after-update';
  const hasHighlights = highlights.length > 0;

  useEffect(() => {
    if (isAfter) fireReleaseConfetti();
  }, [isAfter]);

  const isDownloaded = !isAfter && downloadStatus === 'downloaded';
  const badge = isAfter
    ? t('updateDialog.afterBadge')
    : isDownloaded
      ? t('updateDialog.readyBadge')
      : t('updateDialog.beforeBadge');
  const lead = isDownloaded
    ? t('updateDialog.readyLead')
    : isAfter
      ? hasHighlights
        ? t('updateDialog.afterLeadWithHighlights')
        : t('updateDialog.afterLead')
      : hasHighlights
        ? t('updateDialog.beforeLeadWithHighlights')
        : t('updateDialog.beforeLead');
  const progress = normalizedProgress(downloadProgress);
  const progressDetails = downloadProgressDetails(progress, i18n.language, t);

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onSecondary()}>
      <DialogPortal>
        <DialogOverlay className="update-dialog-overlay">
          <DialogContent className="update-dialog" aria-label={`${badge} ${version}`}>
            <div
              className="update-dialog-cover"
              style={coverImage ? { backgroundImage: `url(${coverImage})` } : undefined}
            >
              <span className="update-dialog-badge">{badge}</span>
              <span className="update-dialog-version">v{version}</span>
              <span className="update-dialog-tagline">{t('updateDialog.tagline')}</span>
            </div>
            <div className="update-dialog-body">
              <p className="update-dialog-lead">{lead}</p>
              {hasHighlights ? (
                <ul className="update-dialog-list">
                  {highlights.map((highlight, index) => {
                    const icon = TYPE_ICON[highlight.type];
                    return (
                      <li className="update-dialog-item" key={`${highlight.type}-${index}`}>
                        <span className={`update-dialog-tag is-${highlight.type}`}>
                          <HugeiconsIcon icon={icon} size={13} aria-hidden />
                          {t(`updateDialog.type.${highlight.type}`)}
                        </span>
                        <span className="update-dialog-text">
                          <span className="update-dialog-title">{highlight.title}</span>
                          {highlight.description ? (
                            <span className="update-dialog-desc">{highlight.description}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div className="update-dialog-footer">
              {isAfter ? (
                <button
                  className="update-dialog-button is-primary"
                  type="button"
                  onClick={onPrimary}
                >
                  <HugeiconsIcon icon={Edit01Icon} size={16} aria-hidden />
                  {t('updateDialog.start')}
                </button>
              ) : (
                <>
                  <button
                    className="update-dialog-button is-ghost"
                    type="button"
                    onClick={onSecondary}
                  >
                    {downloadStatus === 'downloading'
                      ? t('updateDialog.backgroundDownload')
                      : downloadStatus === 'downloaded'
                        ? t('updateDialog.restartLater')
                        : t('updateDialog.later')}
                  </button>
                  {downloadStatus === 'downloaded' ? (
                    <button
                      className="update-dialog-button is-primary"
                      type="button"
                      onClick={onPrimary}
                    >
                      <HugeiconsIcon icon={Refresh01Icon} size={16} aria-hidden />
                      {t('updateDialog.install')}
                    </button>
                  ) : downloadStatus === 'downloading' ? (
                    <div
                      aria-label={t('updateDialog.progressAria', {
                        percent: progress.percent,
                        details: progressDetails,
                      })}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={progress.percent}
                      className="update-dialog-button is-primary is-progress"
                      role="progressbar"
                    >
                      <span
                        aria-hidden
                        className="update-dialog-progress-fill"
                        style={{ width: `${progress.percent}%` }}
                      />
                      <span className="update-dialog-progress-copy is-base">
                        <span>{t('updateDialog.downloading', { percent: progress.percent })}</span>
                        <span className="update-dialog-progress-details">{progressDetails}</span>
                      </span>
                      <span
                        aria-hidden
                        className="update-dialog-progress-copy is-filled"
                        style={{ clipPath: `inset(0 ${100 - progress.percent}% 0 0)` }}
                      >
                        <span>{t('updateDialog.downloading', { percent: progress.percent })}</span>
                        <span className="update-dialog-progress-details">{progressDetails}</span>
                      </span>
                    </div>
                  ) : downloadStatus === 'error' ? (
                    <button
                      className="update-dialog-button is-primary"
                      type="button"
                      onClick={onPrimary}
                    >
                      <HugeiconsIcon icon={Refresh01Icon} size={16} aria-hidden />
                      {t('updateDialog.retryDownload')}
                    </button>
                  ) : (
                    <button
                      className="update-dialog-button is-primary"
                      type="button"
                      onClick={onPrimary}
                    >
                      <HugeiconsIcon icon={CircleArrowUp01Icon} size={16} aria-hidden />
                      {t('updateDialog.updateNow')}
                    </button>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function canOpenUpdateDialog(status: AppUpdateState['status']) {
  return (
    status === 'available' ||
    status === 'downloading' ||
    status === 'download-error' ||
    status === 'downloaded'
  );
}

function normalizedProgress(progress: AppUpdateProgress | undefined) {
  const percent = Number.isFinite(progress?.percent)
    ? Math.min(100, Math.max(0, Math.round(progress?.percent ?? 0)))
    : 0;
  const total = finiteBytes(progress?.total);
  const transferred = Math.min(
    total || Number.MAX_SAFE_INTEGER,
    finiteBytes(progress?.transferred),
  );
  const bytesPerSecond = finiteBytes(progress?.bytesPerSecond);
  return { percent, total, transferred, bytesPerSecond };
}

function finiteBytes(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function downloadProgressDetails(
  progress: ReturnType<typeof normalizedProgress>,
  locale: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (progress.total === 0) return t('updateDialog.preparingDownload');
  const values = {
    transferred: formatBytes(progress.transferred, locale),
    total: formatBytes(progress.total, locale),
  };
  return progress.bytesPerSecond > 0
    ? t('updateDialog.progressDetails', {
        ...values,
        speed: formatBytes(progress.bytesPerSecond, locale),
      })
    : t('updateDialog.progressDetailsWaitingSpeed', values);
}

function formatBytes(bytes: number, locale: string) {
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), 3);
  const value = bytes / 1024 ** unitIndex;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 10 || unitIndex === 0 ? 0 : 1,
  }).format(value)} ${units[unitIndex]}`;
}

const CONFETTI_COLORS = ['#e0a458', '#c2693b', '#4a5a7a', '#7c9a6e', '#d9c8a8', '#b8607a'];

// 更新后弹窗的「大礼花」仪式：左右两侧向中间绽放。命令式自管理画布，结束后自清理。
// 尊重 prefers-reduced-motion，关闭动效时直接跳过。
function fireReleaseConfetti() {
  if (typeof document === 'undefined') return;
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:var(--app-z-top-overlay)';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    rot: number;
    vrot: number;
    color: string;
    life: number;
    decay: number;
  };

  const particles: Particle[] = [];
  const spawn = (originX: number, dir: number) => {
    const cy = window.innerHeight * 0.52;
    for (let i = 0; i < 120; i += 1) {
      const power = 9 + Math.random() * 14;
      const angle = -0.18 + (Math.random() - 0.5) * 0.9;
      particles.push({
        x: originX,
        y: cy + (Math.random() - 0.5) * 140,
        vx: dir * Math.cos(angle) * power * (0.7 + Math.random() * 0.6),
        vy: Math.sin(angle) * power - (2 + Math.random() * 4),
        w: 7 + Math.random() * 6,
        h: 9 + Math.random() * 8,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.4,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 1,
        decay: 0.006 + Math.random() * 0.006,
      });
    }
  };
  spawn(0, 1);
  spawn(window.innerWidth, -1);

  let frame = 0;
  const step = () => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.vx *= 0.992;
      p.vy = p.vy * 0.992 + 0.26;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.life -= p.decay;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      if (particles[i].life <= 0 || particles[i].y > window.innerHeight + 40) {
        particles.splice(i, 1);
      }
    }
    frame += 1;
    if (particles.length > 0 && frame < 400) {
      requestAnimationFrame(step);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(step);
}
