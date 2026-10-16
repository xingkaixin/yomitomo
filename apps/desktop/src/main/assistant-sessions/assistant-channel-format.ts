import type { Annotation, Comment } from '@yomitomo/shared';
import { annotationAuthorName } from '@yomitomo/core';

export function formatChannelMessage(comment: Comment) {
  const author = annotationAuthorName(comment.author);
  const label =
    comment.author.kind === 'agent'
      ? `${author}（@${comment.author.username}）`
      : `${author}（读者）`;
  return `[${comment.id}] ${label}：${comment.content.trim()}`;
}

export function threadComments(annotation: Annotation, threadId: string) {
  return annotation.comments.filter(
    (comment) =>
      comment.content.trim() && (comment.id === threadId || comment.replyTo === threadId),
  );
}

export function formatThread(annotation: Annotation, threadId?: string) {
  const roots = annotation.comments.filter((comment) => !comment.replyTo);
  const threads = threadId ? roots.filter((root) => root.id === threadId) : roots;
  return [
    `批注 ${annotation.id} 的原文：「${annotation.anchor.exact.trim()}」`,
    ...threads.map((root) =>
      [
        `讨论串 ${root.id}：`,
        ...threadComments(annotation, root.id).map(formatChannelMessage),
      ].join('\n'),
    ),
  ].join('\n\n');
}
