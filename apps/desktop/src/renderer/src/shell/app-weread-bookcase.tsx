import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, LinkSquare01Icon, Refresh01Icon } from '@hugeicons/core-free-icons';
import React, { useMemo, useReducer } from 'react';
import type {
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadThought,
} from '@yomitomo/shared';
import { WeReadCover } from '../reading-library/app-reading-library-covers';
import { useTranslation } from 'react-i18next';
import type { WeReadReaderEvent, WeReadReaderMode } from './app-weread-reader-pane';
import { closeWeReadReader, WeReadReaderCompact, WeReadReaderFull } from './app-weread-reader-pane';

export type WeReadNoteGroup = {
  key: string;
  chapterUid?: number;
  range?: string;
  highlight?: WeReadHighlight;
  thoughts: WeReadThought[];
  createTime: number;
};

type WeReadOpenTarget = {
  chapterUid?: number;
  range?: string;
  text?: string;
  userVid?: number;
};

export function WeReadBookcase({
  currentNoteKey,
  detail,
  inAppReader,
  readerMode,
  readerShown,
  syncing,
  onClose,
  onOpenExternal,
  onReaderEvent,
  onSync,
}: {
  currentNoteKey: string | null;
  detail: WeReadBookDetail;
  inAppReader: boolean;
  readerMode: WeReadReaderMode | null;
  readerShown: boolean;
  syncing: boolean;
  onClose: () => void;
  onOpenExternal: (target: WeReadOpenTarget) => void;
  onReaderEvent: (event: WeReadReaderEvent) => void;
  onSync: () => void;
}) {
  const { t } = useTranslation();
  const openTarget = (target: WeReadOpenTarget, mode: WeReadReaderMode, noteKey: string | null) => {
    if (inAppReader) {
      onReaderEvent({ type: 'readerOpened', bookId: detail.book.bookId, mode, noteKey });
    }
    onOpenExternal(target);
  };
  const closeReader = () => {
    onReaderEvent({ type: 'readerClosed' });
    closeWeReadReader();
  };
  const reading = readerMode === 'full';
  const chapters = useChaptersWithCounts(detail, t);
  const [activeChapterUid, dispatch] = useReducer(
    activeChapterReducer,
    chapters,
    (initialChapters) =>
      initialChapters.find((chapter) => chapter.count > 0)?.chapterUid ??
      initialChapters[0]?.chapterUid ??
      null,
  );
  const groups = useMemo(() => groupWeReadNotes(detail), [detail]);
  const bookUserVid = useMemo(
    () => detail.thoughts.find((thought) => thought.userVid !== undefined)?.userVid,
    [detail.thoughts],
  );
  const readingTimeLabel = formatWeReadReadingTime(
    detail.book.readingTime ?? detail.book.recordReadingTime,
    t,
  );
  const readingProgress = clampWeReadReadingProgress(detail.book.readingProgress);
  const readingProgressPercent = Math.round(readingProgress * 100);
  const visibleGroups = activeChapterUid
    ? groups.filter((group) => group.chapterUid === activeChapterUid)
    : groups;
  const activeChapter = chapters.find((chapter) => chapter.chapterUid === activeChapterUid);

  return (
    <section
      className={['weread-bookcase', readerMode === 'compact' ? 'is-reader-compact' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <header className="weread-bookcase-header">
        {reading ? (
          <button
            className="reader-back weread-bookcase-back"
            type="button"
            aria-label={t('wereadBook.readerBackToNotes')}
            onClick={() => onReaderEvent({ type: 'readerCompacted' })}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
            <span>{t('wereadBook.notesBackLabel')}</span>
          </button>
        ) : (
          <button
            className="reader-back weread-bookcase-back"
            type="button"
            aria-label={t('common.backToLibrary')}
            onClick={onClose}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
            <span>{t('readerUi.readerLibrary')}</span>
          </button>
        )}
        <div className="weread-bookcase-title">
          <WeReadCover book={detail.book} variant="cover" />
          <div>
            <h2>{detail.book.title}</h2>
            <p>
              {[detail.book.author || t('wereadBook.weReadFallback'), readingTimeLabel]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className="weread-bookcase-actions">
          {reading ? null : (
            <>
              <button
                className="weread-icon-button"
                type="button"
                aria-label={t('wereadBook.openWeRead')}
                title={t('wereadBook.openWeRead')}
                onClick={() =>
                  readerMode === 'compact'
                    ? onReaderEvent({ type: 'readerExpanded' })
                    : openTarget({}, 'full', null)
                }
              >
                <HugeiconsIcon icon={LinkSquare01Icon} size={16} />
              </button>
              <button type="button" disabled={syncing} onClick={onSync}>
                <HugeiconsIcon icon={Refresh01Icon} size={15} />
                {syncing ? t('wereadBook.syncing') : t('wereadBook.syncBook')}
              </button>
            </>
          )}
        </div>
        <div
          className="weread-bookcase-progress"
          role="progressbar"
          aria-label={t('readerUi.readingProgress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={readingProgressPercent}
        >
          <span style={{ width: `${readingProgressPercent}%` }} />
        </div>
      </header>
      {reading && readerShown ? <WeReadReaderFull /> : null}
      <div className="weread-bookcase-body" hidden={reading}>
        <aside className="weread-toc" aria-label={t('wereadBook.tocLabel')}>
          {chapters.map((chapter) => (
            <button
              type="button"
              className={chapter.chapterUid === activeChapterUid ? 'is-active' : undefined}
              style={{ '--toc-level': Math.max(0, chapter.level - 1) } as React.CSSProperties}
              key={chapter.chapterUid}
              onClick={() => {
                dispatch({ type: 'chapterSelected', chapterUid: chapter.chapterUid });
                if (readerMode === 'compact') {
                  openTarget({ chapterUid: chapter.chapterUid }, 'compact', null);
                }
              }}
            >
              <span>{chapter.title}</span>
              {chapter.count > 0 ? <em>{chapter.count}</em> : null}
            </button>
          ))}
        </aside>
        <main className="weread-note-list" aria-label={t('wereadBook.notesLabel')}>
          {activeChapter ? (
            <header className="weread-note-list-header">
              <h3>{activeChapter.title}</h3>
              <span>{t('wereadBook.noteCount', { count: visibleGroups.length })}</span>
            </header>
          ) : null}
          {visibleGroups.length > 0 ? (
            <ol>
              {visibleGroups.map((group, index) => (
                <li key={group.key}>
                  <WeReadNoteRow
                    current={group.key === currentNoteKey}
                    group={group}
                    index={index + 1}
                    onOpen={() =>
                      openTarget(
                        {
                          chapterUid: group.chapterUid,
                          range: group.range,
                          text: noteQuote(group),
                          userVid: group.thoughts[0]?.userVid ?? bookUserVid,
                        },
                        'compact',
                        group.key,
                      )
                    }
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="weread-empty-chapter">{t('wereadBook.emptyChapter')}</div>
          )}
        </main>
      </div>
      {readerMode === 'compact' && readerShown ? (
        <WeReadReaderCompact
          onClose={closeReader}
          onExpand={() => onReaderEvent({ type: 'readerExpanded' })}
        />
      ) : null}
    </section>
  );
}

type AppT = ReturnType<typeof useTranslation>['t'];

function formatWeReadReadingTime(value: number | undefined, t: AppT) {
  if (!value) return '';
  const minutes = Math.max(1, Math.round(value / 60));
  return t('wereadBook.readingTime', { minutes });
}

function clampWeReadReadingProgress(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / 100));
}

function WeReadNoteRow({
  current,
  group,
  index,
  onOpen,
}: {
  current: boolean;
  group: WeReadNoteGroup;
  index: number;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const quote = noteQuote(group);
  const createdAt = timestampDate(group.createTime);
  return (
    <button
      className="weread-note-row"
      type="button"
      aria-current={current ? 'true' : undefined}
      onClick={onOpen}
    >
      <span className="weread-note-index">{index}</span>
      <span className="weread-note-text">
        {quote ? <span className="weread-note-quote">{quote}</span> : null}
        {group.thoughts.map((thought) => (
          <span className="weread-note-thought" key={thought.reviewId}>
            <span>{t('wereadBook.thoughtLabel')}</span>
            {thought.content}
          </span>
        ))}
      </span>
      <time dateTime={createdAt.toISOString()}>{formatNoteDate(createdAt, i18n.language)}</time>
    </button>
  );
}

function noteQuote(group: WeReadNoteGroup) {
  return group.highlight?.markText || group.thoughts[0]?.abstract || undefined;
}

function formatNoteDate(date: Date, locale: string) {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    year: sameYear ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

function activeChapterReducer(
  _activeChapterUid: number | null,
  event: { type: 'chapterSelected'; chapterUid: number },
) {
  return event.chapterUid;
}

function useChaptersWithCounts(detail: WeReadBookDetail, t: AppT) {
  return useMemo(() => {
    const counts = new Map<number, number>();
    for (const highlight of detail.highlights) {
      counts.set(highlight.chapterUid, (counts.get(highlight.chapterUid) || 0) + 1);
    }
    for (const thought of detail.thoughts) {
      if (thought.chapterUid === undefined) continue;
      counts.set(thought.chapterUid, (counts.get(thought.chapterUid) || 0) + 1);
    }
    const known = detail.chapters.map((chapter) => ({
      ...chapter,
      count: counts.get(chapter.chapterUid) || 0,
    }));
    const knownUids = new Set(known.map((chapter) => chapter.chapterUid));
    const orphanChapters = Array.from(counts)
      .filter(([chapterUid]) => !knownUids.has(chapterUid))
      .map(([chapterUid, count]) => ({
        bookId: detail.book.bookId,
        chapterUid,
        chapterIdx: Number.MAX_SAFE_INTEGER,
        title: t('wereadBook.chapterFallback', { chapterUid }),
        level: 1,
        count,
      }));
    return [...known, ...orphanChapters].toSorted(
      (left, right) => left.chapterIdx - right.chapterIdx,
    );
  }, [detail, t]);
}

function groupWeReadNotes(detail: WeReadBookDetail): WeReadNoteGroup[] {
  const groups = new Map<string, WeReadNoteGroup>();
  for (const highlight of detail.highlights) {
    const key = groupKey(highlight.bookId, highlight.chapterUid, highlight.range);
    groups.set(key, {
      key,
      chapterUid: highlight.chapterUid,
      range: highlight.range,
      highlight,
      thoughts: [],
      createTime: highlight.createTime,
    });
  }
  for (const thought of detail.thoughts) {
    const key =
      thought.chapterUid !== undefined && thought.range
        ? groupKey(thought.bookId, thought.chapterUid, thought.range)
        : thought.reviewId;
    const group = groups.get(key) || {
      key,
      chapterUid: thought.chapterUid,
      range: thought.range,
      thoughts: [],
      createTime: thought.createTime,
    };
    group.thoughts.push(thought);
    group.createTime = Math.min(group.createTime, thought.createTime);
    groups.set(key, group);
  }
  return Array.from(groups.values()).toSorted(
    (left, right) =>
      chapterSortValue(detail.chapters, left.chapterUid) -
        chapterSortValue(detail.chapters, right.chapterUid) ||
      rangeStart(left.range) - rangeStart(right.range) ||
      left.createTime - right.createTime,
  );
}

function groupKey(bookId: string, chapterUid: number, range: string | undefined) {
  return `${bookId}:${chapterUid}:${range || 'unknown'}`;
}

function chapterSortValue(chapters: WeReadChapter[], chapterUid: number | undefined) {
  if (chapterUid === undefined) return Number.MAX_SAFE_INTEGER;
  return chapters.find((chapter) => chapter.chapterUid === chapterUid)?.chapterIdx ?? chapterUid;
}

function rangeStart(range: string | undefined) {
  if (!range) return Number.MAX_SAFE_INTEGER;
  const start = Number(range.split('-')[0]);
  return Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER;
}

function timestampDate(value: number) {
  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}
