import React, { useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import type {
  UserProfile,
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadThought,
} from '@yomitomo/shared';
import type {
  ReadonlyAnnotationCardAuthor,
  ReadonlyAnnotationCardThought,
} from '@yomitomo/reader-ui/reader-readonly-annotation-card';
import { ReadonlyAnnotationCard } from '@yomitomo/reader-ui/reader-readonly-annotation-card';
import { WeReadCover } from '../reading-library/app-reading-library-home';

export type WeReadNoteGroup = {
  key: string;
  chapterUid?: number;
  range?: string;
  highlight?: WeReadHighlight;
  thoughts: WeReadThought[];
  createTime: number;
};

type WeReadNoteAuthor = {
  avatar?: string;
  color: string;
  fallback: string;
  name: string;
};

export type WeReadReadonlyNoteCardModel = {
  author: ReadonlyAnnotationCardAuthor;
  createdAt: string;
  id: string;
  quote?: string;
  thoughts: ReadonlyAnnotationCardThought[];
};

export function WeReadBookcase({
  detail,
  syncing,
  userProfile,
  onClose,
  onOpenExternal,
  onSync,
}: {
  detail: WeReadBookDetail;
  syncing: boolean;
  userProfile: UserProfile;
  onClose: () => void;
  onOpenExternal: (target: { chapterUid?: number; range?: string; userVid?: number }) => void;
  onSync: () => void;
}) {
  const chapters = useChaptersWithCounts(detail);
  const [activeChapterUid, setActiveChapterUid] = useState<number | null>(
    chapters.find((chapter) => chapter.count > 0)?.chapterUid ?? chapters[0]?.chapterUid ?? null,
  );
  const groups = useMemo(() => groupWeReadNotes(detail), [detail]);
  const bookUserVid = useMemo(
    () => detail.thoughts.find((thought) => thought.userVid !== undefined)?.userVid,
    [detail.thoughts],
  );
  const bookAuthor = useMemo(() => {
    const thought = detail.thoughts.find((item) => item.author?.name || item.author?.avatar);
    return thoughtAuthorProfile(thought, userProfile);
  }, [detail.thoughts, userProfile]);
  const readingTimeLabel = formatWeReadReadingTime(
    detail.book.readingTime ?? detail.book.recordReadingTime,
  );
  const visibleGroups = activeChapterUid
    ? groups.filter((group) => group.chapterUid === activeChapterUid)
    : groups;

  return (
    <section className="weread-bookcase">
      <header className="weread-bookcase-header">
        <button
          className="source-reader-back-button"
          type="button"
          aria-label="返回阅读库"
          onClick={onClose}
        >
          <ArrowLeft size={16} />
          返回阅读库
        </button>
        <div className="weread-bookcase-title">
          <WeReadCover book={detail.book} variant="cover" />
          <div>
            <div className="weread-bookcase-heading">
              <h2>{detail.book.title}</h2>
              <button
                className="weread-open-book-button"
                type="button"
                aria-label="打开微信读书"
                title="打开微信读书"
                onClick={() => onOpenExternal({})}
              >
                <ExternalLink size={15} />
              </button>
            </div>
            <p>
              {[detail.book.author || '微信读书', readingTimeLabel].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="weread-bookcase-actions">
          <button type="button" disabled={syncing} onClick={onSync}>
            <RefreshCw size={15} />
            {syncing ? '同步中' : '同步本书'}
          </button>
        </div>
      </header>
      <div className="weread-bookcase-body">
        <aside className="weread-toc" aria-label="微信读书章节">
          {chapters.map((chapter) => (
            <button
              type="button"
              className={chapter.chapterUid === activeChapterUid ? 'is-active' : undefined}
              style={{ '--toc-level': Math.max(0, chapter.level - 1) } as React.CSSProperties}
              key={chapter.chapterUid}
              onClick={() => setActiveChapterUid(chapter.chapterUid)}
            >
              <span>{chapter.title}</span>
              {chapter.count > 0 ? <em>{chapter.count}</em> : null}
            </button>
          ))}
        </aside>
        <main
          className={['weread-note-wall', visibleGroups.length === 0 ? 'is-empty' : '']
            .filter(Boolean)
            .join(' ')}
          aria-label="微信读书划线和想法"
        >
          {visibleGroups.length > 0 ? (
            visibleGroups.map((group) => (
              <WeReadNoteCard
                group={group}
                key={group.key}
                fallbackAuthor={bookAuthor}
                userProfile={userProfile}
                onOpenExternal={() =>
                  onOpenExternal({
                    chapterUid: group.chapterUid,
                    range: group.range,
                    userVid: group.thoughts[0]?.userVid ?? bookUserVid,
                  })
                }
              />
            ))
          ) : (
            <div className="weread-empty-chapter">这一章暂无同步到的划线或想法。</div>
          )}
        </main>
      </div>
    </section>
  );
}

function formatWeReadReadingTime(value: number | undefined) {
  if (!value) return '';
  const minutes = Math.max(1, Math.round(value / 60));
  return `累计阅读 ${minutes} 分钟`;
}

function WeReadNoteCard({
  fallbackAuthor,
  group,
  userProfile,
  onOpenExternal,
}: {
  fallbackAuthor: WeReadNoteAuthor;
  group: WeReadNoteGroup;
  userProfile: UserProfile;
  onOpenExternal: () => void;
}) {
  const model = weReadReadonlyNoteCardModel(group, fallbackAuthor, userProfile);
  return (
    <ReadonlyAnnotationCard
      action={{
        icon: <ExternalLink size={13} />,
        label: '定位到批注',
        onClick: onOpenExternal,
      }}
      author={model.author}
      className="weread-note-card"
      createdAt={model.createdAt}
      id={model.id}
      quote={model.quote}
      thoughts={model.thoughts}
    />
  );
}

function thoughtAuthorProfile(
  thought: WeReadThought | undefined,
  userProfile: UserProfile,
): WeReadNoteAuthor {
  const name = thought?.author?.name || userProfile.nickname || '我';
  return {
    avatar: thought?.author?.avatar || userProfile.avatar,
    color: userProfile.annotationColor,
    fallback: name.slice(0, 1) || '我',
    name,
  };
}

export function weReadReadonlyNoteCardModel(
  group: WeReadNoteGroup,
  fallbackAuthor: WeReadNoteAuthor,
  userProfile: UserProfile,
): WeReadReadonlyNoteCardModel {
  const owner = group.thoughts[0]
    ? thoughtAuthorProfile(group.thoughts[0], userProfile)
    : fallbackAuthor;
  return {
    author: owner,
    createdAt: timestampDate(group.createTime).toISOString(),
    id: group.highlight?.bookmarkId || group.thoughts[0]?.reviewId || group.key,
    quote: group.highlight?.markText || group.thoughts[0]?.abstract || undefined,
    thoughts: group.thoughts.map((thought) => {
      const author = thoughtAuthorProfile(thought, userProfile);
      return {
        author,
        content: thought.content,
        createdAt: timestampDate(thought.createTime).toISOString(),
        id: thought.reviewId,
      };
    }),
  };
}

function useChaptersWithCounts(detail: WeReadBookDetail) {
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
        title: `章节 ${chapterUid}`,
        level: 1,
        count,
      }));
    return [...known, ...orphanChapters].toSorted(
      (left, right) => left.chapterIdx - right.chapterIdx,
    );
  }, [detail]);
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
