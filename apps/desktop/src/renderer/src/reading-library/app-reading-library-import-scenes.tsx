import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import type { ArticleRecord } from '@yomitomo/shared';
import { ArticleBook } from '../shell/app-article-book';
import rabbitWalkSprite from '../assets/reading-library/rabbit-walk.webp';

export type ImportShelfItem = {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'importing' | 'imported' | 'duplicate' | 'error';
  article?: ArticleRecord;
};

type ImportShelfTrip = { id: number; itemIds: string[] };

export type ImportShelfState = {
  placedIds: string[];
  trip: ImportShelfTrip | null;
  nextTripId: number;
};

type ShelfSlot = { id: string; x: number; width: number; height: number };

const SHELF_WIDTH = 440;
const COVER_MODE_MAX_ITEMS = 5;
const COVER_WIDTH = 44;
const COVER_HEIGHT = 62;
const COVER_GAP = 18;
const SPINE_GAP = 6;
// 80 MB 的电子书和 120 MB 的 PDF 都按 40 MB 封顶，书脊宽度只需要分出厚薄。
const SPINE_FULL_BYTES = 40 * 1024 * 1024;
const SPINE_HEIGHTS = [78, 72, 82, 76, 84, 74, 80];
const SPINE_TONES = 5;
const RABBIT_START_X = -96;
const RABBIT_END_X = SHELF_WIDTH + 56;
// 兔子手臂在精灵图右侧，停靠点让书落在它前方。
const RABBIT_REACH = 30;
const RABBIT_SPEED_PX_PER_MS = 0.26;
const RABBIT_STOP_MS = 260;
const TRIP_MAX_MS = 2000;
const BOOK_LAND_LEAD_MS = 60;

export const emptyImportShelf: ImportShelfState = { placedIds: [], trip: null, nextTripId: 1 };

export function queueImportShelfTrip(
  shelf: ImportShelfState,
  items: ImportShelfItem[],
): ImportShelfState {
  if (shelf.trip) return shelf;
  const itemIds = items
    .filter((item) => item.status === 'imported' && !shelf.placedIds.includes(item.id))
    .map((item) => item.id);
  if (itemIds.length === 0) return shelf;
  return { ...shelf, trip: { id: shelf.nextTripId, itemIds }, nextTripId: shelf.nextTripId + 1 };
}

export function finishImportShelfTrip(
  shelf: ImportShelfState,
  tripId: number,
  items: ImportShelfItem[],
): ImportShelfState {
  if (shelf.trip?.id !== tripId) return shelf;
  const placed = { ...shelf, placedIds: [...shelf.placedIds, ...shelf.trip.itemIds], trip: null };
  return queueImportShelfTrip(placed, items);
}

export function isImportShelfSettled(shelf: ImportShelfState, items: ImportShelfItem[]) {
  return (
    !shelf.trip &&
    items.every((item) => item.status !== 'imported' || shelf.placedIds.includes(item.id))
  );
}

function shelfSlots(items: ImportShelfItem[]) {
  const coverMode = items.length <= COVER_MODE_MAX_ITEMS;
  const sizes = items.map((item, index) =>
    coverMode
      ? { width: COVER_WIDTH, height: COVER_HEIGHT }
      : {
          width: 14 + Math.round(12 * Math.min(1, Math.sqrt(item.fileSize / SPINE_FULL_BYTES))),
          height: SPINE_HEIGHTS[index % SPINE_HEIGHTS.length],
        },
  );
  const gap = coverMode ? COVER_GAP : SPINE_GAP;
  const totalWidth =
    sizes.reduce((total, size) => total + size.width, 0) + gap * (sizes.length - 1);
  let x = (SHELF_WIDTH - totalWidth) / 2;
  const slots = items.map((item, index): ShelfSlot => {
    const slot = { id: item.id, x, ...sizes[index] };
    x += sizes[index].width + gap;
    return slot;
  });
  return { coverMode, slots };
}

function tripTimeline(slots: ShelfSlot[], itemIds: string[]) {
  const stops = slots
    .filter((slot) => itemIds.includes(slot.id))
    .map((slot) => ({ id: slot.id, x: slot.x + slot.width / 2 - RABBIT_REACH }));
  const walkMs = (RABBIT_END_X - RABBIT_START_X) / RABBIT_SPEED_PX_PER_MS;
  const naturalMs = walkMs + stops.length * RABBIT_STOP_MS;
  const scale = Math.min(1, TRIP_MAX_MS / naturalMs);
  const duration = naturalMs * scale;

  // 用 translate 而不是 transform：兔子带 scale: 1.25，transform 里的位移会被一起放大。
  const keyframes: Keyframe[] = [{ translate: `${RABBIT_START_X}px 0`, offset: 0 }];
  const landDelays = new Map<string, number>();
  let elapsed = 0;
  let previousX = RABBIT_START_X;
  for (const stop of stops) {
    elapsed += ((stop.x - previousX) / RABBIT_SPEED_PX_PER_MS) * scale;
    keyframes.push({ translate: `${stop.x}px 0`, offset: elapsed / duration });
    landDelays.set(stop.id, elapsed + BOOK_LAND_LEAD_MS * scale);
    elapsed += RABBIT_STOP_MS * scale;
    keyframes.push({ translate: `${stop.x}px 0`, offset: elapsed / duration });
    previousX = stop.x;
  }
  keyframes.push({ translate: `${RABBIT_END_X}px 0`, offset: 1 });
  return { duration, keyframes, landDelays };
}

// 空闲时的拖放区：兔子站在书箱旁，光标示范把文件拖进书箱。
export function LibraryImportCrate({
  dragging,
  fileLabel,
}: {
  dragging: boolean;
  fileLabel: string;
}) {
  return (
    <span
      className={`library-import-crate${dragging ? ' is-dragging' : ''}`}
      aria-hidden="true"
      style={
        { '--library-import-walker-sprite': `url(${rabbitWalkSprite})` } as React.CSSProperties
      }
    >
      <span className="library-import-crate-floor" />
      <i className="library-import-crate-rabbit" />
      <span className="library-import-crate-box">
        <span className="library-import-crate-back" />
        <span className="library-import-crate-peek is-1" />
        <span className="library-import-crate-peek is-2" />
        <span className="library-import-crate-drop">
          <span className="library-import-crate-file">
            <em>{fileLabel}</em>
          </span>
          <span className="library-import-crate-book" />
        </span>
        <span className="library-import-crate-front" />
      </span>
      <svg className="library-import-crate-cursor" width="18" height="22" viewBox="0 0 18 22">
        <path d="M2 2v15.5l4.1-3.9 2.6 6.1 2.7-1.2-2.6-6h5.8z" />
      </svg>
    </span>
  );
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function displayTitle(item: ImportShelfItem) {
  return item.article?.title || item.fileName.replace(/\.[^.]+$/, '');
}

export function LibraryImportShelf({
  ariaLabel,
  items,
  openLabel,
  progress,
  settled,
  shelf,
  onOpenArticle,
  onTripFinished,
}: {
  ariaLabel: string;
  items: ImportShelfItem[];
  openLabel: (title: string) => string;
  progress: number;
  settled: boolean;
  shelf: ImportShelfState;
  onOpenArticle: (article: ArticleRecord) => void;
  onTripFinished: (tripId: number) => void;
}) {
  const { coverMode, slots } = shelfSlots(items);
  const trip = shelf.trip;
  const timeline = trip ? tripTimeline(slots, trip.itemIds) : null;
  const lastSlot = slots.at(-1);
  const rabbitStyle = {
    '--library-import-walker-sprite': `url(${rabbitWalkSprite})`,
  } as React.CSSProperties;

  function walkTrip(element: HTMLElement | null) {
    if (!element || !trip || !timeline) return;
    const animation = element.animate(timeline.keyframes, {
      duration: prefersReducedMotion() ? 0 : timeline.duration,
      fill: 'forwards',
    });
    animation.onfinish = () => onTripFinished(trip.id);
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }

  return (
    <div
      className={`library-import-shelf${coverMode ? ' is-covers' : ' is-spines'}`}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(progress)}
    >
      <div className="library-import-shelf-stage" style={{ width: SHELF_WIDTH }}>
        {items.map((item, index) => {
          const slot = slots[index];
          const landDelay = timeline?.landDelays.get(item.id);
          const placed = shelf.placedIds.includes(item.id);
          const slotStyle = {
            left: slot.x,
            width: slot.width,
            height: slot.height,
            '--library-import-land-delay': `${landDelay ?? 0}ms`,
          } as React.CSSProperties;

          if (item.status === 'error') {
            return (
              <span
                className="library-import-shelf-slot is-ghost is-error"
                key={item.id}
                style={slotStyle}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </span>
            );
          }

          const visible = item.status === 'duplicate' || placed || landDelay !== undefined;
          if (!visible) {
            return (
              <span
                className={`library-import-shelf-slot is-ghost${item.status === 'importing' ? ' is-parsing' : ''}`}
                key={item.id}
                style={slotStyle}
              />
            );
          }

          const title = displayTitle(item);
          const book =
            coverMode && item.article ? (
              <span className="library-import-shelf-cover">
                <ArticleBook article={item.article} />
              </span>
            ) : (
              <span className={`library-import-shelf-spine is-tone-${index % SPINE_TONES}`}>
                {title}
              </span>
            );
          const className = [
            'library-import-shelf-slot',
            'is-book',
            item.status === 'duplicate' ? 'is-duplicate' : '',
            landDelay !== undefined ? 'is-landing' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const article = item.article;

          if (landDelay !== undefined) {
            return (
              <React.Fragment key={item.id}>
                <span className="library-import-shelf-slot is-ghost" style={slotStyle} />
                <span className={className} style={slotStyle}>
                  {book}
                </span>
              </React.Fragment>
            );
          }

          return settled && article ? (
            <button
              aria-label={openLabel(title)}
              className={className}
              key={item.id}
              style={slotStyle}
              title={title}
              type="button"
              onClick={() => onOpenArticle(article)}
            >
              {book}
            </button>
          ) : (
            <span className={className} key={item.id} style={slotStyle}>
              {book}
            </span>
          );
        })}
        <span className="library-import-shelf-board" />
        {trip ? (
          <i
            className="library-import-shelf-rabbit is-walking"
            key={trip.id}
            ref={walkTrip}
            style={rabbitStyle}
          />
        ) : settled && lastSlot ? (
          <i
            className="library-import-shelf-rabbit is-resting"
            style={{
              ...rabbitStyle,
              translate: `${lastSlot.x + lastSlot.width + 8}px 0`,
            }}
          />
        ) : (
          <i className="library-import-shelf-rabbit is-waiting" style={rabbitStyle} />
        )}
      </div>
    </div>
  );
}
