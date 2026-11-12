import { createArticleTextIndex } from '@yomitomo/core';
import {
  assistantReferenceHref,
  parseAssistantReference,
  type ArticleRecord,
  type ArticleTextSnapshot,
  type AssistantReference,
} from '@yomitomo/shared';

export type ReplyDiscussion = { annotationId: string; quote: string };

const BLOCK_ID = String.raw`b\d+(?:\s*[-–—]\s*b?\d+)?`;
const CITED_ID = String.raw`${BLOCK_ID}|(?:comment|annotation)_\w+`;
// An agent link [label](#id), a bracketed id [b12], or a bare id such as b12 or comment_x.
const CITATION = new RegExp(
  String.raw`\[([^\]\n]+)\]\(#([\w:–—-]+)\)|\[(${CITED_ID})\](?!\()|(?<![\w#:/.-])(${CITED_ID})(?!\w)`,
  'gi',
);
const ID_IN_LABEL = new RegExp(String.raw`(?<!\w)(?:${CITED_ID})(?!\w)`, 'i');
const EXCERPT_LENGTH = 16;
const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' });

// Agents are asked to cite as [label](#b12) but often write the bare id. Saved replies carry
// in-app links instead; a bare id gets the cited text as its label, and a link that resolves
// to nothing keeps only its label.
export function resolveReplyLinks(
  text: string,
  snapshot: ArticleTextSnapshot | undefined,
  findDiscussion: (id: string) => ReplyDiscussion | undefined,
) {
  return replyLinkResolver(snapshot, findDiscussion)(text);
}

export function resolveArticleReplyLinks(article: ArticleRecord, snapshot: ArticleTextSnapshot) {
  const resolveLinks = replyLinkResolver(snapshot, (id) => {
    const annotation = article.annotations.find(
      (item) => item.id === id || item.comments.some((comment) => comment.id === id),
    );
    return annotation && { annotationId: annotation.id, quote: annotation.anchor.exact };
  });
  return {
    ...article,
    annotations: article.annotations.map((annotation) => ({
      ...annotation,
      comments: annotation.comments.map((comment) =>
        comment.author.kind === 'agent'
          ? { ...comment, content: resolveLinks(comment.content) }
          : comment,
      ),
    })),
  };
}

function replyLinkResolver(
  snapshot: ArticleTextSnapshot | undefined,
  findDiscussion: (id: string) => ReplyDiscussion | undefined,
) {
  let index: ReturnType<typeof createArticleTextIndex> | undefined;
  const resolve = (id: string): { reference: AssistantReference; label: string } | undefined => {
    const reference = parseAssistantReference(`#${id}`);
    if (reference?.kind === 'passage') {
      return snapshot && reference.end <= snapshot.text.length
        ? { reference, label: excerpt(snapshot.text.slice(reference.start, reference.end)) }
        : undefined;
    }
    if (reference?.kind === 'discussion') id = reference.annotationId;
    const range = id.match(/^b(\d+)(?:\s*[-–—]\s*b?(\d+))?$/i);
    if (range) {
      index ??= snapshot ? createArticleTextIndex(snapshot) : undefined;
      const first = index?.readBlocks(`b${range[1]}`, 1)?.blocks[0];
      const last = range[2] ? index?.readBlocks(`b${range[2]}`, 1)?.blocks[0] : first;
      return first && last && first.start <= last.start
        ? {
            reference: { kind: 'passage', start: first.start, end: last.end },
            label: excerpt(first.text),
          }
        : undefined;
    }
    const discussion = findDiscussion(id);
    return discussion
      ? {
          reference: { kind: 'discussion', annotationId: discussion.annotationId },
          label: excerpt(discussion.quote),
        }
      : undefined;
  };
  return (text: string) =>
    text.replace(
      CITATION,
      (
        match,
        label: string | undefined,
        linkId: string | undefined,
        bracketId: string | undefined,
        bareId: string | undefined,
      ) => {
        const id = (linkId ?? bracketId ?? bareId)!;
        const savedReference = linkId ? parseAssistantReference(`#${linkId}`) : undefined;
        if (savedReference && label && !ID_IN_LABEL.test(label)) return match;
        const resolved = resolve(id);
        if (!resolved) return savedReference ? match : (label ?? match);
        const shown = label && !ID_IN_LABEL.test(label) ? label : resolved.label;
        return `[${shown}](${assistantReferenceHref(resolved.reference)})`;
      },
    );
}

function excerpt(text: string) {
  const cleaned = text.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(graphemes.segment(cleaned), (part) => part.segment);
  const head = chars.slice(0, EXCERPT_LENGTH).join('');
  return `「${chars.length > EXCERPT_LENGTH ? `${head}…` : head}」`;
}
