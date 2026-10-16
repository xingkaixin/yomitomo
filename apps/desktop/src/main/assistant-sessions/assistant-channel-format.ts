import type { Annotation, Comment } from '@yomitomo/shared';
import { annotationAuthorName } from '@yomitomo/core';

export function formatChannelMessage(comment: Comment, selfAgentId?: string) {
  const author = annotationAuthorName(comment.author);
  const label =
    comment.author.kind !== 'agent'
      ? `${author}（读者）`
      : comment.author.agentId === selfAgentId
        ? `你（@${comment.author.username}）`
        : `${author}（@${comment.author.username}）`;
  return `[${comment.id}] ${label}：${comment.content.trim()}`;
}

export function threadComments(annotation: Annotation, threadId: string) {
  return annotation.comments.filter(
    (comment) =>
      comment.content.trim() && (comment.id === threadId || comment.replyTo === threadId),
  );
}

export function formatThread(annotation: Annotation, threadId?: string, selfAgentId?: string) {
  const roots = annotation.comments.filter((comment) => !comment.replyTo);
  const threads = threadId ? roots.filter((root) => root.id === threadId) : roots;
  return [
    `批注 ${annotation.id} 的原文：「${annotation.anchor.exact.trim()}」`,
    ...threads.map((root) =>
      [
        `讨论串 ${root.id}：`,
        ...threadComments(annotation, root.id).map((comment) =>
          formatChannelMessage(comment, selfAgentId),
        ),
      ].join('\n'),
    ),
  ].join('\n\n');
}
