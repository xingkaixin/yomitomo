import type {
  Annotation,
  ArticleRecord,
  Comment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { formatDateTimeValue, relativeTimeParts } from '@yomitomo/shared';
import { findMentionedAgents, type getMentionQuery } from '@yomitomo/core';
import { mentionDraftWithAgent } from '@yomitomo/reader-ui/reader-mention-utils';
import i18next from 'i18next';
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
  const articleTitle = compactTitleText(article.title || i18next.t('discussion.untitledArticle'));
  return quote
    ? i18next.t('discussion.windowTitle', { title: quote })
    : i18next.t('discussion.windowTitle', { title: articleTitle });
}

export function waitForMilliseconds(duration: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

export function assistantThoughtRouteNote(note: string, agents: PublicAgent[]) {
  return `${agents.map((agent) => `@${agent.username}`).join(' ')} ${note}`.trim();
}

export function replyTargetAgents(content: string, root: Comment, agents: PublicAgent[]) {
  const mentionedAgents = findMentionedAgents(content, agents);
  if (mentionedAgents.length > 0) return mentionedAgents;

  const rootAgent = rootThoughtAgent(root, agents);
  return rootAgent ? [rootAgent] : [];
}

export function discussionReplyPlaceholder(root: Comment, agents: PublicAgent[]) {
  const rootAgent = rootThoughtAgent(root, agents);
  if (!rootAgent) return i18next.t('discussion.replyPlaceholder');
  return i18next.t('discussion.replyAgentPlaceholder', { name: rootAgent.nickname });
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
  const parts = relativeTimeParts(value);
  if (!parts) return value;
  if (parts.unit === 'second') return i18next.t('discussion.time.justNow');
  return i18next.t(`discussion.time.${parts.unit}`, { count: parts.count });
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
    nickname: annotation.userNickname || i18next.t('common.me'),
    username: annotation.userUsername || 'user',
    avatar: annotation.userAvatar || '',
    annotationColor: annotation.userAnnotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}

function compactTitleText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function rootThoughtAgent(root: Comment, agents: PublicAgent[]) {
  if (root.author !== 'ai') return undefined;
  return agents.find(
    (agent) =>
      (root.agentId && agent.id === root.agentId) ||
      (root.agentUsername && agent.username === root.agentUsername),
  );
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
  return formatDateTimeValue(value, i18next.language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function htmlText(value: string) {
  const container = document.createElement('div');
  container.innerHTML = value;
  return container.textContent?.replace(/\s+/g, ' ').trim() || '';
}
