import React, { useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Lightbulb, RefreshCw } from 'lucide-react';
import type {
  UserProfile,
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadThought,
} from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import { WeReadCover } from './app-reading-library-home';

type WeReadNoteGroup = {
  key: string;
  chapterUid?: number;
  range?: string;
  highlight?: WeReadHighlight;
  thoughts: WeReadThought[];
  createTime: number;
};

type WeReadNoteAuthor = {
  avatar?: string;
  fallback: string;
  name: string;
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
          <WeReadCover book={detail.book} />
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
              {detail.book.author || '微信读书'} · {Math.round(detail.book.readingProgress)}% 已读
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
        <main className="weread-note-wall" aria-label="微信读书划线和想法">
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
  const quote = group.highlight?.markText || group.thoughts[0]?.abstract || '';
  const owner = group.thoughts[0]
    ? thoughtAuthorProfile(group.thoughts[0], userProfile)
    : fallbackAuthor;
  const createdAt = timestampDate(group.createTime).toISOString();
  return (
    <article
      className="reader-note weread-note-card"
      style={{ '--reader-note-accent': userProfile.annotationColor } as React.CSSProperties}
    >
      <div className="reader-note-body">
        <header className="reader-note-card-header">
          {quote ? (
            <button className="reader-note-quote" type="button" onClick={onOpenExternal}>
              <span className="reader-note-quote-mark" aria-hidden="true">
                “
              </span>
              <span className="reader-note-quote-text">{quote}</span>
            </button>
          ) : null}
        </header>
        <div className="reader-note-meta">
          <span
            className="reader-note-owner"
            style={{ '--reader-avatar-color': userProfile.annotationColor } as React.CSSProperties}
            aria-hidden="true"
          >
            <AvatarBadge avatar={owner.avatar} fallback={owner.fallback} />
          </span>
          <span className="reader-note-meta-copy">
            <strong>{owner.name}</strong>
          </span>
          <span className="reader-note-time-actions">
            <time dateTime={createdAt}>{formatWeReadDate(group.createTime)}</time>
          </span>
        </div>
        <footer className="reader-note-toolbar weread-note-toolbar">
          <span className="reader-note-thread-toggle">
            <span className="reader-note-thread-toggle-main">
              <span className="reader-comment-count" aria-label={`${group.thoughts.length} 条想法`}>
                <span>{group.thoughts.length}</span>
                <Lightbulb size={14} />
              </span>
            </span>
          </span>
          <button type="button" onClick={onOpenExternal}>
            <ExternalLink size={13} />
            定位到批注
          </button>
        </footer>
      </div>
      {group.thoughts.length > 0 ? (
        <div className="reader-note-comments-region">
          <div className="reader-note-comments-panel">
            <div className="reader-comments">
              {group.thoughts.map((thought) => (
                <WeReadThoughtComment
                  thought={thought}
                  userProfile={userProfile}
                  key={thought.reviewId}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function WeReadThoughtComment({
  thought,
  userProfile,
}: {
  thought: WeReadThought;
  userProfile: UserProfile;
}) {
  const author = thoughtAuthorProfile(thought, userProfile);
  const createdAt = timestampDate(thought.createTime).toISOString();
  const html = renderMarkdown(thought.content);
  return (
    <div className="reader-comment is-root">
      <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
      <div className="reader-comment-body">
        <div className="reader-comment-author">
          <strong>{author.name}</strong>
          <time dateTime={createdAt}>{formatWeReadDate(thought.createTime)}</time>
        </div>
        <div className="reader-markdown reader-comment-markdown">
          <div className="reader-markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

function AvatarBadge({ avatar, fallback }: { avatar?: string; fallback: string }) {
  const image = avatar && /^(data:image\/|blob:|https?:\/\/|\/)/.test(avatar);
  return (
    <span className={['reader-avatar-badge', image ? 'is-image' : ''].filter(Boolean).join(' ')}>
      {image ? <img alt="" src={avatar} /> : fallback}
    </span>
  );
}

function thoughtAuthorProfile(
  thought: WeReadThought | undefined,
  userProfile: UserProfile,
): WeReadNoteAuthor {
  const name = thought?.author?.name || userProfile.nickname || '我';
  return {
    avatar: thought?.author?.avatar || userProfile.avatar,
    fallback: name.slice(0, 1) || '我',
    name,
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

function formatWeReadDate(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestampDate(value));
}
