import type {
  Annotation,
  ArticleRecord,
  Comment,
  PublicAgent,
  UserProfile,
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadThought,
} from '@yomitomo/shared';
import { annotationCommentThreads, commentPersona } from '../reader/annotations';
import { sortAnnotations } from '../reader/reading';

export type MarkdownExportLabels = {
  aiTag: string;
  author: string;
  chapterFallback: (chapterUid: number) => string;
  distillation: string;
  otherNotes: string;
  source: string;
  untitled: string;
};

export const defaultMarkdownExportLabels: MarkdownExportLabels = {
  aiTag: 'AI',
  author: '作者',
  chapterFallback: (chapterUid) => `第 ${chapterUid} 章`,
  distillation: '沉淀',
  otherNotes: '其他想法',
  source: '来源',
  untitled: '未命名文章',
};

export type ArticleMarkdownExportInput = {
  article: ArticleRecord;
  userProfile: UserProfile;
  agents?: PublicAgent[];
  labels?: Partial<MarkdownExportLabels>;
};

export type DistillationMarkdownExportInput = {
  articleTitle: string;
  articleByline?: string;
  sourceUrl?: string;
  quote: string;
  content: string;
  labels?: Partial<MarkdownExportLabels>;
};

export type WeReadBookMarkdownExportInput = {
  detail: WeReadBookDetail;
  labels?: Partial<MarkdownExportLabels>;
};

export function sanitizeMarkdownFileName(title: string, fallback = 'notes'): string {
  const cleaned = stripControlChars(title)
    .replace(/\.md$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80)
    .trim();
  const base = cleaned || fallback;
  return `${base}.md`;
}

function stripControlChars(value: string) {
  let result = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    result += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  return result;
}

export function formatArticleNotesMarkdown({
  article,
  userProfile,
  agents = [],
  labels: labelOverrides,
}: ArticleMarkdownExportInput): string {
  const labels = resolveLabels(labelOverrides);
  const title = article.title.trim() || labels.untitled;
  const sections: string[] = [`# ${title}`];

  const meta = buildMetadataLines({
    author: articleAuthor(article),
    sourceUrl: articleSourceUrl(article),
    labels,
  });
  if (meta.length > 0) sections.push(meta.join('\n'));

  const annotations = sortAnnotations(article.annotations);
  const annotationBlocks = annotations
    .map((annotation) => formatAnnotationBlock(annotation, userProfile, agents, labels))
    .filter(Boolean);

  if (annotationBlocks.length > 0) {
    sections.push(annotationBlocks.join('\n\n---\n\n'));
  }

  return `${sections.join('\n\n')}\n`;
}

export function formatDistillationMarkdown({
  articleTitle,
  articleByline,
  sourceUrl,
  quote,
  content,
  labels: labelOverrides,
}: DistillationMarkdownExportInput): string {
  const labels = resolveLabels(labelOverrides);
  const title = articleTitle.trim() || labels.untitled;
  const sections: string[] = [`# ${title}`];

  const meta = buildMetadataLines({
    author: articleByline?.trim() || undefined,
    sourceUrl: sourceUrl?.trim() || undefined,
    labels,
  });
  if (meta.length > 0) sections.push(meta.join('\n'));

  if (quote.trim()) {
    sections.push(formatBlockquote(quote));
  }
  if (content.trim()) {
    sections.push(content);
  }

  return `${sections.join('\n\n')}\n`;
}

export function formatWeReadBookMarkdown({
  detail,
  labels: labelOverrides,
}: WeReadBookMarkdownExportInput): string {
  const labels = resolveLabels(labelOverrides);
  const title = detail.book.title.trim() || labels.untitled;
  const sections: string[] = [`# ${title}`];

  const meta = buildMetadataLines({
    author: detail.book.author?.trim() || undefined,
    labels,
  });
  if (meta.length > 0) sections.push(meta.join('\n'));

  const groups = groupWeReadNotes(detail);
  const groupsByChapter = new Map<number | 'other', WeReadNoteGroup[]>();
  for (const group of groups) {
    const key = group.chapterUid === undefined ? 'other' : group.chapterUid;
    const list = groupsByChapter.get(key) ?? [];
    list.push(group);
    groupsByChapter.set(key, list);
  }

  const chapterOrder = orderedWeReadChapters(detail, groupsByChapter, labels);
  for (const chapter of chapterOrder) {
    const chapterGroups = groupsByChapter.get(chapter.key);
    if (!chapterGroups || chapterGroups.length === 0) continue;
    const itemBlocks = chapterGroups.map(formatWeReadNoteGroup).filter(Boolean);
    if (itemBlocks.length === 0) continue;
    sections.push(`## ${chapter.title}\n\n${itemBlocks.join('\n\n')}`);
  }

  return `${sections.join('\n\n')}\n`;
}

function resolveLabels(overrides?: Partial<MarkdownExportLabels>): MarkdownExportLabels {
  return {
    ...defaultMarkdownExportLabels,
    ...overrides,
  };
}

function articleAuthor(article: ArticleRecord): string | undefined {
  if (article.byline?.trim()) return article.byline.trim();
  if (article.sourceType === 'pdf' && article.pdf?.metadata.author?.trim()) {
    return article.pdf.metadata.author.trim();
  }
  return undefined;
}

function articleSourceUrl(article: ArticleRecord): string | undefined {
  if (article.sourceType !== 'web') return undefined;
  const raw = (article.canonicalUrl || article.url || '').trim();
  return /^https?:\/\//i.test(raw) ? raw : undefined;
}

function buildMetadataLines({
  author,
  sourceUrl,
  labels,
}: {
  author?: string;
  sourceUrl?: string;
  labels: MarkdownExportLabels;
}): string[] {
  const lines: string[] = [];
  if (author) lines.push(`- ${labels.author}: ${author}`);
  if (sourceUrl) lines.push(`- ${labels.source}: ${sourceUrl}`);
  return lines;
}

function formatAnnotationBlock(
  annotation: Annotation,
  userProfile: UserProfile,
  agents: PublicAgent[],
  labels: MarkdownExportLabels,
): string {
  const parts: string[] = [];
  if (annotation.anchor.exact.trim()) {
    parts.push(formatBlockquote(annotation.anchor.exact));
  }

  if (annotation.distillation?.status === 'published' && annotation.distillation.content.trim()) {
    parts.push(`### ${labels.distillation}\n\n${annotation.distillation.content}`);
  }

  const threads = annotationCommentThreads(annotation.comments)
    .map(({ root, replies }) => ({
      root,
      replies: replies.toSorted(compareCommentsOldestFirst),
    }))
    .toSorted((left, right) => compareCommentsOldestFirst(left.root, right.root));

  const threadLines: string[] = [];
  for (const thread of threads) {
    if (thread.root.content.trim()) {
      threadLines.push(formatCommentListItem(thread.root, userProfile, agents, labels, 0));
    }
    for (const reply of thread.replies) {
      if (!reply.content.trim()) continue;
      threadLines.push(formatCommentListItem(reply, userProfile, agents, labels, 1));
    }
  }
  if (threadLines.length > 0) {
    parts.push(threadLines.join('\n'));
  }

  return parts.join('\n\n');
}

function formatCommentListItem(
  comment: Comment,
  userProfile: UserProfile,
  agents: PublicAgent[],
  labels: MarkdownExportLabels,
  depth: 0 | 1,
): string {
  const persona = commentPersona(comment, userProfile, agents);
  const authorLabel =
    comment.author.kind === 'agent'
      ? `**${persona.nickname}** (${labels.aiTag})`
      : `**${persona.nickname}**`;
  const indent = depth === 1 ? '  ' : '';
  const continuationIndent = depth === 1 ? '    ' : '  ';
  const lines = normalizeLineEndings(comment.content).split('\n');
  const body = lines.map((line) => (line ? `${continuationIndent}${line}` : ''));
  return [`${indent}- ${authorLabel}:`, '', ...body].join('\n');
}

function formatBlockquote(text: string): string {
  return (
    normalizeLineEndings(text)
      // CommonMark allows backslash escapes for all ASCII punctuation.
      .replace(/[!-/:-@[-\x60{-~]/g, '\\$&')
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n')
  );
}

function formatWeReadNoteGroup(group: WeReadNoteGroup): string {
  const parts: string[] = [];
  const quote = group.highlight?.markText || group.thoughts[0]?.abstract || '';
  if (quote.trim()) {
    parts.push(formatBlockquote(quote));
  }
  const thoughts = group.thoughts
    .filter((thought) => thought.content.trim())
    .map((thought) => {
      const lines = normalizeLineEndings(thought.content).split('\n');
      if (lines.length === 1) return `- ${lines[0]}`;
      return [`- ${lines[0]}`, ...lines.slice(1).map((line) => (line ? `  ${line}` : ''))].join(
        '\n',
      );
    });
  if (thoughts.length > 0) {
    parts.push(thoughts.join('\n'));
  }
  return parts.join('\n\n');
}

type WeReadNoteGroup = {
  key: string;
  chapterUid?: number;
  range?: string;
  highlight?: WeReadHighlight;
  thoughts: WeReadThought[];
  createTime: number;
};

function orderedWeReadChapters(
  detail: WeReadBookDetail,
  groupsByChapter: Map<number | 'other', WeReadNoteGroup[]>,
  labels: MarkdownExportLabels,
): Array<{ key: number | 'other'; title: string }> {
  const known = detail.chapters
    .toSorted((left, right) => left.chapterIdx - right.chapterIdx)
    .map((chapter) => ({
      key: chapter.chapterUid as number | 'other',
      title: chapter.title.trim() || labels.chapterFallback(chapter.chapterUid),
    }));
  const knownUids = new Set(detail.chapters.map((chapter) => chapter.chapterUid));
  const orphanUids = Array.from(groupsByChapter.keys())
    .filter((key): key is number => typeof key === 'number' && !knownUids.has(key))
    .toSorted((left, right) => left - right)
    .map((chapterUid) => ({
      key: chapterUid as number | 'other',
      title:
        groupsByChapter
          .get(chapterUid)
          ?.flatMap((group) => group.thoughts)
          .find((thought) => thought.chapterName?.trim())
          ?.chapterName?.trim() || labels.chapterFallback(chapterUid),
    }));

  const ordered = [...known, ...orphanUids];
  if (groupsByChapter.has('other')) {
    ordered.push({ key: 'other', title: labels.otherNotes });
  }
  return ordered;
}

function groupWeReadNotes(detail: WeReadBookDetail): WeReadNoteGroup[] {
  const groups = new Map<string, WeReadNoteGroup>();
  for (const highlight of detail.highlights) {
    const key = weReadGroupKey(highlight.bookId, highlight.chapterUid, highlight.range);
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
        ? weReadGroupKey(thought.bookId, thought.chapterUid, thought.range)
        : thought.reviewId;
    const existing = groups.get(key) || {
      key,
      chapterUid: thought.chapterUid,
      range: thought.range,
      thoughts: [],
      createTime: thought.createTime,
    };
    existing.thoughts.push(thought);
    existing.createTime = Math.min(existing.createTime, thought.createTime);
    groups.set(key, existing);
  }
  return Array.from(groups.values()).toSorted(
    (left, right) =>
      chapterSortValue(detail.chapters, left.chapterUid) -
        chapterSortValue(detail.chapters, right.chapterUid) ||
      rangeStart(left.range) - rangeStart(right.range) ||
      left.createTime - right.createTime,
  );
}

function weReadGroupKey(bookId: string, chapterUid: number, range: string | undefined) {
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

function compareCommentsOldestFirst(left: Comment, right: Comment) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}
