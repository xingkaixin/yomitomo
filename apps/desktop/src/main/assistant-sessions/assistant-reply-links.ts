import { createArticleTextIndex } from '@yomitomo/core';
import {
  assistantReferenceHref,
  type ArticleTextSnapshot,
  type AssistantReference,
} from '@yomitomo/shared';

export type ReplyDiscussion = { annotationId: string; quote: string };

const CITED_ID = String.raw`b\d+|(?:comment|annotation)_\w+`;
// An agent link [label](#id), a bracketed id [b12], or a bare id such as b12 or comment_x.
const CITATION = new RegExp(
  String.raw`\[([^\]\n]+)\]\(#([\w-]+)\)|\[(${CITED_ID})\](?!\()|(?<![\w#:/.-])(${CITED_ID})(?!\w)`,
  'g',
);
const ONLY_CITED_ID = new RegExp(String.raw`^(?:${CITED_ID})$`);
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
  let index: ReturnType<typeof createArticleTextIndex> | undefined;
  const resolve = (id: string): { reference: AssistantReference; label: string } | undefined => {
    if (/^b\d+$/.test(id)) {
      index ??= snapshot ? createArticleTextIndex(snapshot) : undefined;
      const block = index?.readBlocks(id, 1)?.blocks[0];
      return block
        ? {
            reference: { kind: 'passage', start: block.start, end: block.end },
            label: excerpt(block.text),
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
  return text.replace(
    CITATION,
    (
      match,
      label: string | undefined,
      linkId: string | undefined,
      bracketId: string | undefined,
      bareId: string | undefined,
    ) => {
      const resolved = resolve((linkId ?? bracketId ?? bareId)!);
      if (!resolved) return label ?? match;
      const shown = label && !ONLY_CITED_ID.test(label) ? label : resolved.label;
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
