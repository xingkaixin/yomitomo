import type React from 'react';
import { useCallback, useReducer } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons';
import {
  islandControls,
  useIslandNotice,
  useIslandShape,
  type IslandNotice,
  type IslandShape,
  type IslandTone,
} from './app-toast';

const toneIcons: Record<IslandTone, typeof Alert02Icon> = {
  error: CancelCircleIcon,
  info: InformationCircleIcon,
  success: CheckmarkCircle02Icon,
  warning: Alert02Icon,
};

const hiddenShape = { width: 40, height: 12, borderRadius: 6, opacity: 0 };
const compactHeight = 34;
const expandedRadius = 24;

const expandSpring: Transition = { type: 'spring', stiffness: 380, damping: 26, mass: 1 };
const collapseSpring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 1 };
const exitSpring: Transition = { type: 'spring', stiffness: 520, damping: 42, mass: 1 };
const fadeTransition: Transition = { duration: 0.2, ease: 'easeOut' };

type MeasuredView = { key: string; width: number; height: number };

function measuredViewsReducer(views: MeasuredView[], measured: MeasuredView) {
  const current = views.find((view) => view.key === measured.key);
  if (current && current.width === measured.width && current.height === measured.height) {
    return views;
  }
  return [...views.filter((view) => view.key !== measured.key).slice(-3), measured];
}

export function AppIsland() {
  const notice = useIslandNotice();
  const shape = useIslandShape();
  const reduceMotion = useReducedMotion() ?? false;
  const [measuredViews, reportView] = useReducer(measuredViewsReducer, []);
  const viewKey = notice ? `${notice.id}:${shape}` : '';
  const measured =
    measuredViews.find((view) => view.key === viewKey) ?? measuredViews.at(-1) ?? null;

  const measureView = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      // offsetWidth ignores the scale transform the view enters with.
      const report = () =>
        reportView({ key: viewKey, width: element.offsetWidth, height: element.offsetHeight });
      report();
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [viewKey],
  );

  const width = measured?.width ?? hiddenShape.width;
  const height = shape === 'compact' ? compactHeight : (measured?.height ?? compactHeight);
  const sizeTransition: Transition = reduceMotion
    ? { duration: 0 }
    : shape === 'expanded'
      ? expandSpring
      : collapseSpring;

  return (
    <div className="app-island-anchor">
      <AnimatePresence>
        {notice ? (
          <motion.div
            key="island"
            animate={{
              width,
              height,
              borderRadius: shape === 'expanded' ? expandedRadius : height / 2,
              opacity: 1,
            }}
            aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
            className="app-island"
            data-shape={shape}
            exit={{ ...hiddenShape, transition: reduceMotion ? fadeTransition : exitSpring }}
            initial={hiddenShape}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            tabIndex={0}
            transition={{ default: sizeTransition, opacity: fadeTransition }}
            onClick={islandControls.toggle}
            onKeyDown={toggleOnKey}
            onMouseEnter={islandControls.pause}
            onMouseLeave={islandControls.resume}
          >
            <AnimatePresence>
              <motion.div
                key={viewKey}
                animate={{
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                  transition: {
                    delay: reduceMotion ? 0 : 0.09,
                    duration: 0.24,
                    ease: 'easeOut',
                    scale: { ...expandSpring, delay: 0.09 },
                  },
                }}
                className="app-island-view"
                exit={{
                  opacity: 0,
                  scale: reduceMotion ? 1 : 0.94,
                  filter: reduceMotion ? 'blur(0px)' : 'blur(6px)',
                  transition: { duration: 0.12, ease: 'easeOut' },
                }}
                initial={{
                  opacity: 0,
                  scale: reduceMotion ? 1 : 0.94,
                  filter: reduceMotion ? 'blur(0px)' : 'blur(6px)',
                }}
              >
                <div ref={measureView} className={`app-island-body is-${shape}`}>
                  <IslandContent notice={notice} shape={shape} />
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function toggleOnKey(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  islandControls.toggle();
}

function IslandContent({ notice, shape }: { notice: IslandNotice; shape: IslandShape }) {
  if (shape === 'compact') {
    return (
      <>
        <IslandIcon notice={notice} size={16} />
        <span className="app-island-compact-title">{notice.title}</span>
        {notice.progress?.label ? (
          <span className="app-island-count">{notice.progress.label}</span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <IslandIcon notice={notice} size={22} />
      <div className="app-island-copy">
        <p className="app-island-title">{notice.title}</p>
        {notice.description ? (
          <p className="app-island-description" title={notice.description}>
            {notice.description}
          </p>
        ) : null}
        {notice.progress ? (
          <span aria-hidden="true" className="app-island-progress">
            <span style={{ width: `${progressPercent(notice.progress.value)}%` }} />
          </span>
        ) : null}
      </div>
      {notice.action ? (
        <button
          className="app-island-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            islandControls.runAction();
          }}
        >
          {notice.actionDone ? (
            <>
              <HugeiconsIcon icon={Tick01Icon} size={14} />
              {notice.action.doneLabel ?? notice.action.label}
            </>
          ) : (
            notice.action.label
          )}
        </button>
      ) : null}
    </>
  );
}

function IslandIcon({ notice, size }: { notice: IslandNotice; size: number }) {
  if (notice.progress) return <ProgressRing size={size} value={notice.progress.value} />;
  return (
    <span className="app-island-icon" data-tone={notice.tone}>
      <HugeiconsIcon icon={toneIcons[notice.tone]} size={size} strokeWidth={1.8} />
    </span>
  );
}

function ProgressRing({ size, value }: { size: number; value: number }) {
  const radius = size / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="app-island-icon app-island-ring">
      <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progressPercent(value) / 100)}
        />
      </svg>
    </span>
  );
}

function progressPercent(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}
