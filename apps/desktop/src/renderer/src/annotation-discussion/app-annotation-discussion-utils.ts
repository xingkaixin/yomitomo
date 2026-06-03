import type {
  Annotation,
  ArticleRecord,
  Comment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import type { getMentionQuery } from '@yomitomo/core';
import { mentionDraftWithAgent } from '@yomitomo/reader-ui/reader-mention-utils';
import { articlePlainText } from '../shell/app-utils';

export type DiscussionThread = {
  isPinned: boolean;
  pending: boolean;
  replies: Comment[];
  replyCount: number;
  root: Comment;
  updatedAt: string;
};

export function discussionWindowTitle({
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

export function waitForMilliseconds(duration: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

export function assistantThoughtRouteNote(note: string, agents: PublicAgent[]) {
  return `${agents.map((agent) => `@${agent.username}`).join(' ')} ${note}`.trim();
}

export function insertMentionAtCaret(
  content: string,
  username: string,
  caretIndex: number,
  mentionQuery: ReturnType<typeof getMentionQuery>,
) {
  return insertMentionAtSelection(content, username, caretIndex, caretIndex, mentionQuery);
}

export function insertMentionAtSelection(
  content: string,
  username: string,
  selectionStart: number,
  selectionEnd: number,
  mentionQuery: ReturnType<typeof getMentionQuery>,
) {
  if (selectionStart === selectionEnd && mentionQuery)
    return mentionDraftWithAgent(content, username, mentionQuery);

  const start = Math.max(0, Math.min(selectionStart, selectionEnd, content.length));
  const end = Math.max(start, Math.min(Math.max(selectionStart, selectionEnd), content.length));
  const before = content.slice(0, start);
  const after = content.slice(end);
  const prefix = before && !/\s$/u.test(before) ? ' ' : '';
  const suffix = after ? (/^\s/u.test(after) ? '' : ' ') : ' ';
  const mention = `${prefix}@${username}${suffix}`;
  const nextContent = `${before}${mention}${after}`;
  const caretPadding = suffix === '' && /^\s/u.test(after) ? 1 : 0;
  return {
    content: nextContent,
    caretIndex: before.length + mention.length + caretPadding,
  };
}

export function discussionThreads(
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

export function formatRelativeTime(value: string) {
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

export function discussionArticleText(article: ArticleRecord) {
  if (article.contentHtml) return articlePlainText(article);
  if (article.ebook?.chapters.length) {
    return article.ebook.chapters.map((chapter) => htmlText(chapter.html)).join('\n\n');
  }
  return [article.excerpt, article.annotations.map((item) => item.anchor.exact).join('\n')]
    .filter(Boolean)
    .join('\n\n');
}

export function annotationUserProfile(annotation: Annotation, article: ArticleRecord): UserProfile {
  return {
    id: annotation.userId || 'user',
    nickname: annotation.userNickname || '我',
    username: annotation.userUsername || 'user',
    avatar: annotation.userAvatar || '',
    annotationColor: annotation.userAnnotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}

function compactTitleText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
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

export function formatAbsoluteTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function htmlText(value: string) {
  const container = document.createElement('div');
  container.innerHTML = value;
  return container.textContent?.replace(/\s+/g, ' ').trim() || '';
}
