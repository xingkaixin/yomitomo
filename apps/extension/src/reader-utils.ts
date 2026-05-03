import type React from 'react';
import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationColor, timestamp } from '@yomitomo/core';
import type { ReaderSettings } from './reader-components';
import type { HighlightBox, TocItem } from './reader-dom';

export const defaultUserProfile: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '',
};

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  contentWidth: 860,
};

export type TocAnnotationStats = {
  count: number;
  colors: string[];
};

export function normalizeUserProfile(user: Partial<UserProfile> | undefined): UserProfile {
  return {
    ...defaultUserProfile,
    ...user,
    id: user?.id || defaultUserProfile.id,
    annotationColor: user?.annotationColor || defaultUserProfile.annotationColor,
  };
}

export function toCachedArticleRecord(record: ArticleRecord): ArticleRecord {
  return {
    ...record,
    contentHtml: undefined,
  };
}

export function agentQueueKey(annotation: Annotation) {
  return annotation.agentId || annotation.agentUsername || '__agent__';
}

export function isNewerArticleRecord(record: ArticleRecord, current: ArticleRecord | null) {
  return !current || timestamp(record.updatedAt) > timestamp(current.updatedAt);
}

export function buildTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  const stats = new Map<number, TocAnnotationStats>();

  for (const item of tocItems) {
    const sectionAnnotations = annotations.filter(
      (annotation) => annotation.anchor.start >= item.start && annotation.anchor.start < item.end,
    );
    const colors = Array.from(
      new Set(
        sectionAnnotations.map((annotation) => annotationColor(annotation, userProfile, agents)),
      ),
    );
    stats.set(item.index, { count: sectionAnnotations.length, colors });
  }

  return stats;
}

export function isPrimaryTocItem(item: TocItem) {
  return item.depth <= 1;
}

export function getShortcutModifier() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘' : 'Ctrl';
}

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function highlightStyle(box: HighlightBox, active: boolean): React.CSSProperties {
  const color = box.color || defaultUserProfile.annotationColor;
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    backgroundColor: alphaColor(color, active ? 0.45 : 0.28),
    boxShadow: `0 0 0 ${active ? 2 : 1}px ${alphaColor(color, active ? 0.72 : 0.36)}`,
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function animateTheaterHighlight(
  boxes: HighlightBox[],
  textLength: number,
  onFrame: (boxes: HighlightBox[]) => void,
) {
  const sortedBoxes = [...boxes].toSorted((a, b) => a.top - b.top || a.left - b.left);
  const duration = clampNumber(textLength * 28, 780, 2600, 1200);
  const start = performance.now();

  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased =
        progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const boxProgress = eased * sortedBoxes.length;
      const nextBoxes = sortedBoxes.flatMap((box, index) => {
        if (index < Math.floor(boxProgress)) return [box];
        if (index > Math.floor(boxProgress)) return [];

        const width = box.width * Math.max(0.08, boxProgress - index);
        return [{ ...box, width }];
      });
      onFrame(nextBoxes);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        onFrame(sortedBoxes);
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
}

function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(244,201,93,${alpha})`;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}
