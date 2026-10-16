import { createArticleTextIndex } from '@yomitomo/core';
import {
  assistantReferenceHref,
  type ArticleTextSnapshot,
  type AssistantReference,
} from '@yomitomo/shared';

const AGENT_LINK = /\[([^\]\n]+)\]\(#([\w-]+)\)/g;

// Agents cite a paragraph as [label](#b12) and a discussion as [label](#comment_id). Saved replies
// carry in-app links instead, and a citation that resolves to nothing keeps only its label.
export function resolveReplyLinks(
  text: string,
  snapshot: ArticleTextSnapshot | undefined,
  findDiscussion: (id: string) => string | undefined,
) {
  let index: ReturnType<typeof createArticleTextIndex> | undefined;
  const resolve = (id: string): AssistantReference | undefined => {
    if (/^b\d+$/.test(id)) {
      index ??= snapshot ? createArticleTextIndex(snapshot) : undefined;
      const block = index?.readBlocks(id, 1)?.blocks[0];
      return block ? { kind: 'passage', start: block.start, end: block.end } : undefined;
    }
    const annotationId = findDiscussion(id);
    return annotationId ? { kind: 'discussion', annotationId } : undefined;
  };
  return text.replace(AGENT_LINK, (_match, label: string, id: string) => {
    const reference = resolve(id);
    return reference ? `[${label}](${assistantReferenceHref(reference)})` : label;
  });
}
