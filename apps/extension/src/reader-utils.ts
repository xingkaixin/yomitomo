import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  annotationColor,
  buildTocAnnotationStats as buildCoreTocAnnotationStats,
  buildHighlightSegments,
  highlightSegmentStyle,
  highlightStyle,
  isPrimaryTocItem,
  timestamp,
  updateAnnotationComment,
} from '@yomitomo/core';
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

export function applyAgentCommentDelta(
  annotations: Annotation[],
  annotationId: string,
  commentId: string,
  delta: string,
) {
  return updateAnnotationComment(annotations, annotationId, commentId, (comment) => ({
    ...comment,
    content: comment.content + delta,
  }));
}

export function buildTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  return buildCoreTocAnnotationStats(tocItems, annotations, (annotation) =>
    annotationColor(annotation, userProfile, agents),
  );
}

export function getShortcutModifier() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘' : 'Ctrl';
}

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export { buildHighlightSegments, highlightSegmentStyle, highlightStyle, isPrimaryTocItem };

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
