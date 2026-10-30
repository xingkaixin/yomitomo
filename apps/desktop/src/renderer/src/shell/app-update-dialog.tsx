import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  CircleArrowUp01Icon,
  CircleOffIcon,
  Edit01Icon,
  Refresh01Icon,
  SparklesIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useStore } from 'zustand';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import './app-update-dialog.css';
import type {
  AppSettingsPatch,
  DesktopStore,
  ReleaseNoteHighlight,
  ReleaseNoteHighlightType,
  UiLanguage,
} from '@yomitomo/shared';
import { normalizeUiLanguage, selectHighlights, shouldShowAfterUpdate } from '@yomitomo/shared';
import type { AppUpdateProgress, AppUpdateState } from '../../../app-update-types';
import { resolveAppThemeId, themeRegistry } from '../theme/app-theme';
import coverLighterImage from '../assets/update/updater-cover-lighter.webp';
import coverDarkerImage from '../assets/update/updater-cover-darker.webp';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '../components/ui/dialog';
import { getDesktopApi } from './app-desktop-api';
import { useAppSessionStoreApi } from './app-session';

type ReleaseDialogScene = 'before-update' | 'after-update';

type DownloadStatus = 'idle' | 'downloading' | 'error' | 'downloaded';

// 版本号和下载决策是必需 UI，远程文案是可选补充：先开弹窗，文案到了再补。
function remoteReleaseNoteQuery(version: string, language: UiLanguage) {
  return queryOptions({
    queryKey: ['updates', 'releaseNote', 'remote', version, language],
    queryFn: () => getDesktopApi().updates.getReleaseNote({ version, source: 'remote', language }),
  });
}

const TYPE_ICON: Record<ReleaseNoteHighlightType, IconSvgElement> = {
  new: SparklesIcon,
  changed: Refresh01Icon,
  deprecated: CircleOffIcon,
  fixed: Wrench01Icon,
};

// 容器：负责更新后弹窗的判定与文案数据获取，渲染纯展示的 View。更新前弹窗的开关由 session store 决定。
// B（更新后）：启动比对 lastSeenVersion 与当前版本，命中则读本地文案并弹窗，随后推进 lastSeenVersion。
export function UpdateReleaseDialog({
  store,
  updateState,
  onSaveSettings,
}: {
  store: DesktopStore;
  updateState: AppUpdateState | null;
  onSaveSettings: (settings: AppSettingsPatch) => Promise<DesktopStore>;
}) {
  const { i18n } = useTranslation();
  const sessionStore = useAppSessionStoreApi();
  const dialog = useStore(sessionStore, (state) => state.updateDialog.dialog);
  const { dispatchUpdateDialog } = sessionStore.getState().actions;
  const beforeUpdateVersion = dialog?.scene === 'before-update' ? dialog.version : '';
  const { data: remoteNote } = useQuery({
    ...remoteReleaseNoteQuery(beforeUpdateVersion, normalizeUiLanguage(i18n.language)),
    enabled: Boolean(beforeUpdateVersion),
  });

  // B：每次启动只判定一次。无论是否弹窗，都把 lastSeenVersion 推进到当前版本，避免下次误判。
  const handleCurrentVersion = useStableCallback((version: string) => {
    if (!version) return;
    const lastSeenVersion = store.settings.lastSeenVersion;
    if (lastSeenVersion !== version) {
      void onSaveSettings({ ...store.settings, lastSeenVersion: version });
    }
    if (!shouldShowAfterUpdate(lastSeenVersion, version)) return;
    void getDesktopApi()
      .updates.getReleaseNote({
        version,
        source: 'local',
        language: normalizeUiLanguage(i18n.language),
      })
      .then((note) => {
        dispatchUpdateDialog({
          type: 'afterUpdateOpened',
          version,
          highlights: note ? selectHighlights(note, 'after-update') : [],
        });
      });
  });

  useMountEffect(() => {
    void getDesktopApi()
      .app.getInfo()
      .then((info) => handleCurrentVersion(info.desktopVersion));
  });

  if (!dialog) return null;

  const downloadStatus: DownloadStatus =
    dialog.scene === 'before-update' && updateState?.status === 'downloading'
      ? 'downloading'
      : dialog.scene === 'before-update' && updateState?.status === 'download-error'
        ? 'error'
        : dialog.scene === 'before-update' && updateState?.status === 'downloaded'
          ? 'downloaded'
          : 'idle';

  const highlights =
    dialog.scene === 'after-update'
      ? dialog.highlights
      : remoteNote
        ? selectHighlights(remoteNote, 'before-update')
        : [];

  const handlePrimary = () => {
    if (dialog.scene === 'after-update') {
      dispatchUpdateDialog({ type: 'closed' });
      return;
    }
    // 下载完成停留在「重启安装」态；点击触发安装。其余情况触发下载，下载进度在弹窗内推进，不关闭弹窗。
    if (downloadStatus === 'downloaded') {
      void (async () => {
        if (updateState?.simulation === 'development') {
          await onSaveSettings({ ...store.settings, lastSeenVersion: '0.0.0' });
        }
        await getDesktopApi().updates.install();
      })();
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
      highlights={highlights}
      coverImage={coverImage}
      downloadStatus={downloadStatus}
      downloadProgress={updateState?.progress}
      onPrimary={handlePrimary}
      onSecondary={() => dispatchUpdateDialog({ type: 'closed' })}
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
    <>
      {isAfter ? <ReleaseConfetti /> : null}
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
                          <span>
                            {t('updateDialog.downloading', { percent: progress.percent })}
                          </span>
                          <span className="update-dialog-progress-details">{progressDetails}</span>
                        </span>
                        <span
                          aria-hidden
                          className="update-dialog-progress-copy is-filled"
                          style={{ clipPath: `inset(0 ${100 - progress.percent}% 0 0)` }}
                        >
                          <span>
                            {t('updateDialog.downloading', { percent: progress.percent })}
                          </span>
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
    </>
  );
}

function ReleaseConfetti() {
  useMountEffect(fireReleaseConfetti);
  return null;
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
