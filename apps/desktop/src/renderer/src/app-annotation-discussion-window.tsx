import { useEffect, useMemo, useState } from 'react';
import { AlignLeft, GitPullRequestDraft, MessageCircle, Pin, PinOff, Trash2 } from 'lucide-react';
import type { Annotation, ArticleRecord, Comment, UserProfile } from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import { commentPersona } from '@yomitomo/core';
import { applyAppTheme, readCachedThemeId, themeRegistry } from './app-theme';

type DiscussionLayoutMode = 'split' | 'left';

type DiscussionWindowStatus =
  | { type: 'loading' }
  | { type: 'ready'; article: ArticleRecord; annotation: Annotation }
  | { type: 'missing' }
  | { type: 'error'; message: string };

export function AnnotationDiscussionWindowApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const articleId = params.get('articleId') || '';
  const annotationId = params.get('annotationId') || '';
  const [status, setStatus] = useState<DiscussionWindowStatus>({ type: 'loading' });
  const className = annotationDiscussionWindowClassName();

  useEffect(() => {
    const syncTheme = () => applyAppTheme(themeRegistry[readCachedThemeId()]);
    window.addEventListener('storage', syncTheme);
    window.addEventListener('focus', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('focus', syncTheme);
    };
  }, []);

  useEffect(() => {
    document.title = status.type === 'ready' ? discussionWindowTitle(status) : '批注讨论';
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    if (!articleId || !annotationId) {
      setStatus({ type: 'missing' });
      return;
    }

    void window.yomitomoDesktop
      .getArticle(articleId)
      .then((article) => {
        if (cancelled) return;
        const annotation = article?.annotations.find((item) => item.id === annotationId);
        setStatus(
          article && annotation ? { type: 'ready', article, annotation } : { type: 'missing' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : '讨论窗口加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [annotationId, articleId]);

  if (status.type === 'ready') {
    return (
      <AnnotationDiscussionShell
        article={status.article}
        annotation={status.annotation}
        className={className}
      />
    );
  }

  const message =
    status.type === 'loading'
      ? '正在载入批注讨论'
      : status.type === 'missing'
        ? '找不到这条批注讨论'
        : status.message;

  return (
    <main className={className}>
      <section className="annotation-discussion-empty" aria-busy={status.type === 'loading'}>
        <MessageCircle size={24} />
        <strong>{message}</strong>
      </section>
    </main>
  );
}

function AnnotationDiscussionShell({
  annotation,
  article,
  className,
}: {
  annotation: Annotation;
  article: ArticleRecord;
  className: string;
}) {
  const [currentAnnotation, setCurrentAnnotation] = useState(annotation);
  const [pinnedThoughtIds, setPinnedThoughtIds] = useState<Set<string>>(() => new Set());
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<DiscussionLayoutMode>('split');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    setCurrentAnnotation(annotation);
    setRemoved(false);
  }, [annotation]);

  const userProfile = annotationUserProfile(annotation, article);
  const threads = useMemo(
    () => discussionThreads(currentAnnotation, pinnedThoughtIds),
    [currentAnnotation, pinnedThoughtIds],
  );
  const selectedThread =
    threads.find((thread) => thread.root.id === selectedThoughtId) || threads[0] || null;
  const replies = currentAnnotation.comments.length - threads.length;

  useEffect(() => {
    if (!threads.length) {
      setSelectedThoughtId(null);
      return;
    }
    setSelectedThoughtId((current) =>
      current && threads.some((thread) => thread.root.id === current)
        ? current
        : threads[0].root.id,
    );
  }, [threads]);

  async function deleteComment(commentId: string) {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      await window.yomitomoDesktop.deleteArticleComment(
        article.id,
        currentAnnotation.id,
        commentId,
      );
      const nextArticle = await window.yomitomoDesktop.getArticle(article.id);
      const nextAnnotation = nextArticle?.annotations.find(
        (item) => item.id === currentAnnotation.id,
      );
      if (!nextAnnotation) {
        setRemoved(true);
        return;
      }
      setCurrentAnnotation(nextAnnotation);
      setPinnedThoughtIds((current) => {
        if (!current.has(commentId)) return current;
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    } finally {
      setDeletingCommentId(null);
    }
  }

  function togglePinnedThought(commentId: string) {
    setPinnedThoughtIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }

  if (removed) {
    return (
      <main className={className}>
        <section className="annotation-discussion-empty">
          <MessageCircle size={24} />
          <strong>这条批注已删除</strong>
        </section>
      </main>
    );
  }

  return (
    <main className={className}>
      <section className="annotation-discussion-quote" aria-label="批注引文">
        <span aria-hidden="true">“</span>
        <p>{currentAnnotation.anchor.exact}</p>
      </section>

      <section className="annotation-discussion-layout" aria-label="批注讨论窗口">
        <aside className="annotation-discussion-ideas">
          <header>
            <strong>想法</strong>
            <span>{threads.length}</span>
          </header>
          {threads.length > 0 ? (
            <div className="annotation-discussion-idea-list">
              {threads.map((thread) => (
                <ThoughtListItem
                  key={thread.root.id}
                  isDeleting={deletingCommentId === thread.root.id}
                  isSelected={thread.root.id === selectedThread?.root.id}
                  thread={thread}
                  userProfile={userProfile}
                  onDelete={() => void deleteComment(thread.root.id)}
                  onPin={() => togglePinnedThought(thread.root.id)}
                  onSelect={() => setSelectedThoughtId(thread.root.id)}
                />
              ))}
            </div>
          ) : (
            <p>还没有想法</p>
          )}
        </aside>
        <section className="annotation-discussion-thread">
          <header>
            <strong>讨论区</strong>
            <div className="annotation-discussion-thread-actions">
              <span>{replies} 条回复</span>
              <SegmentedLayoutControl value={layoutMode} onChange={setLayoutMode} />
            </div>
          </header>
          {selectedThread ? (
            <DiscussionThreadView
              deletingCommentId={deletingCommentId}
              layoutMode={layoutMode}
              thread={selectedThread}
              userProfile={userProfile}
              onDelete={(commentId) => void deleteComment(commentId)}
            />
          ) : (
            <div className="annotation-discussion-thread-placeholder">
              <MessageCircle size={22} />
              <strong>选择想法查看讨论</strong>
              <p>这条批注的讨论会在这里展开。</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

type DiscussionThread = {
  isPinned: boolean;
  pending: boolean;
  replies: Comment[];
  replyCount: number;
  root: Comment;
  updatedAt: string;
};

function ThoughtListItem({
  isDeleting,
  isSelected,
  onDelete,
  onPin,
  onSelect,
  thread,
  userProfile,
}: {
  isDeleting: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onPin: () => void;
  onSelect: () => void;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const author = commentPersona(thread.root, userProfile, []);
  const itemClassName = [
    'annotation-discussion-idea',
    isSelected ? 'is-selected' : '',
    thread.pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={itemClassName}>
      <button className="annotation-discussion-idea-main" type="button" onClick={onSelect}>
        <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
        <span>
          <strong>{author.nickname}</strong>
          <em>{thread.root.content}</em>
          <small>
            {formatRelativeTime(thread.updatedAt)} · {thread.replyCount} 条回复
            {thread.pending ? ' · 处理中' : ''}
          </small>
        </span>
      </button>
      <div className="annotation-discussion-idea-actions">
        <button
          type="button"
          onClick={onPin}
          aria-label={thread.isPinned ? '取消置顶' : '置顶想法'}
        >
          {thread.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button type="button" onClick={onDelete} disabled={isDeleting} aria-label="删除想法和回复">
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}

function SegmentedLayoutControl({
  onChange,
  value,
}: {
  onChange: (value: DiscussionLayoutMode) => void;
  value: DiscussionLayoutMode;
}) {
  return (
    <div className="annotation-discussion-layout-control" aria-label="消息布局">
      <button
        className={value === 'split' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('split')}
      >
        <GitPullRequestDraft size={13} />
        左右
      </button>
      <button
        className={value === 'left' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('left')}
      >
        <AlignLeft size={13} />
        左齐
      </button>
    </div>
  );
}

function DiscussionThreadView({
  deletingCommentId,
  layoutMode,
  onDelete,
  thread,
  userProfile,
}: {
  deletingCommentId: string | null;
  layoutMode: DiscussionLayoutMode;
  onDelete: (commentId: string) => void;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const messages = thread.replies;
  const className = [
    'annotation-discussion-messages',
    layoutMode === 'left' ? 'is-left-aligned' : 'is-split',
  ].join(' ');

  return (
    <div className="annotation-discussion-thread-body">
      <div className="annotation-discussion-thread-meta">
        <time dateTime={thread.root.createdAt}>{formatAbsoluteTime(thread.root.createdAt)}</time>
        {thread.pending ? <span>助手回复中</span> : null}
      </div>
      {messages.length > 0 ? (
        <div className={className}>
          {messages.map((message) => (
            <DiscussionMessage
              isDeleting={deletingCommentId === message.id}
              key={message.id}
              message={message}
              userProfile={userProfile}
              onDelete={() => onDelete(message.id)}
            />
          ))}
        </div>
      ) : (
        <div className="annotation-discussion-reply-empty">
          <MessageCircle size={24} />
          <strong>当前没有讨论</strong>
          <p>这条想法还没有回复。</p>
        </div>
      )}
      <footer className="annotation-discussion-composer-placeholder">
        <span>回复输入将在下一阶段接入。</span>
      </footer>
    </div>
  );
}

function DiscussionMessage({
  isDeleting,
  message,
  onDelete,
  userProfile,
}: {
  isDeleting: boolean;
  message: Comment;
  onDelete: () => void;
  userProfile: UserProfile;
}) {
  const author = commentPersona(message, userProfile, []);
  const html = renderMarkdown(message.content);
  const className = [
    'annotation-discussion-message',
    message.author === 'user' ? 'is-user' : 'is-assistant',
    message.pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
      <div className="annotation-discussion-message-bubble">
        <header>
          <strong>{author.nickname}</strong>
          <span>{formatRelativeTime(message.createdAt)}</span>
          {message.pending ? <em>回复中</em> : null}
          <button type="button" onClick={onDelete} disabled={isDeleting} aria-label="删除回复">
            <Trash2 size={13} />
          </button>
        </header>
        <div
          className="annotation-discussion-markdown"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </article>
  );
}

function annotationDiscussionWindowClassName() {
  return ['annotation-discussion-window', `is-${window.yomitomoDesktop.platform ?? 'unknown'}`]
    .filter(Boolean)
    .join(' ');
}

function discussionWindowTitle({
  annotation,
  article,
}: {
  article: ArticleRecord;
  annotation: Annotation;
}) {
  const quote = compactTitleText(annotation.anchor.exact);
  const articleTitle = compactTitleText(article.title || '未命名文章');
  return quote ? `批注讨论 - ${quote}` : `批注讨论 - ${articleTitle}`;
}

function compactTitleText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function discussionThreads(
  annotation: Annotation,
  pinnedThoughtIds: Set<string>,
): DiscussionThread[] {
  const roots = annotation.comments.filter((comment) => !comment.replyTo);
  const rootIds = new Set(roots.map((comment) => comment.id));
  const repliesByRoot = new Map(roots.map((comment) => [comment.id, [] as Comment[]]));
  const fallbackRoot = roots[0];

  for (const comment of annotation.comments) {
    if (rootIds.has(comment.id)) continue;
    const rootId =
      comment.replyTo && rootIds.has(comment.replyTo) ? comment.replyTo : fallbackRoot?.id;
    if (!rootId) continue;
    repliesByRoot.get(rootId)?.push(comment);
  }

  return roots
    .map((root) => {
      const replies = (repliesByRoot.get(root.id) || []).toSorted(compareCommentsOldestFirst);
      const updatedAt = latestCommentTime([root, ...replies]);
      return {
        isPinned: pinnedThoughtIds.has(root.id),
        pending: root.pending || replies.some((reply) => reply.pending),
        replies,
        replyCount: replies.length,
        root,
        updatedAt,
      };
    })
    .toSorted(compareThreads);
}

function compareThreads(a: DiscussionThread, b: DiscussionThread) {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  return timestamp(b.updatedAt) - timestamp(a.updatedAt);
}

function compareCommentsOldestFirst(a: Comment, b: Comment) {
  return timestamp(a.createdAt) - timestamp(b.createdAt);
}

function latestCommentTime(comments: Comment[]) {
  return comments.reduce(
    (latest, comment) => {
      const value = timestamp(comment.createdAt);
      return value > timestamp(latest) ? comment.createdAt : latest;
    },
    comments[0]?.createdAt || new Date(0).toISOString(),
  );
}

function timestamp(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function formatRelativeTime(value: string) {
  const deltaMs = Date.now() - timestamp(value);
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (deltaMs < minute) return '刚刚';
  if (deltaMs < hour) return `${Math.floor(deltaMs / minute)} 分钟前`;
  if (deltaMs < day) return `${Math.floor(deltaMs / hour)} 小时前`;
  if (deltaMs < day * 7) return `${Math.floor(deltaMs / day)} 天前`;
  return formatAbsoluteTime(value);
}

function formatAbsoluteTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function AvatarBadge({ avatar, fallback }: { avatar?: string; fallback: string }) {
  const value = fallback.slice(0, 2).toUpperCase();

  return (
    <span className={['reader-avatar-badge', avatar ? 'is-image' : ''].filter(Boolean).join(' ')}>
      {avatar ? <img alt="" src={avatar} /> : value}
    </span>
  );
}

function annotationUserProfile(annotation: Annotation, article: ArticleRecord): UserProfile {
  return {
    id: annotation.userId || 'user',
    nickname: annotation.userNickname || '我',
    username: annotation.userUsername || 'user',
    avatar: annotation.userAvatar || '',
    annotationColor: annotation.userAnnotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}
