export type AnnotationAuthor = "user" | "ai";

export type ProviderType = "openai" | "anthropic" | "gemini";

export type AnnotationType = "key_point" | "assumption" | "concept" | "question" | "quote";

export type AgentAnnotationDensity = "low" | "medium" | "high";

export type LlmProvider = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
};

export type Agent = {
  id: string;
  providerId: string;
  nickname: string;
  username: string;
  avatar: string;
  annotationColor: string;
  annotationDensity: AgentAnnotationDensity;
  temperature: number;
  soul: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicAgent = Omit<Agent, "providerId" | "soul" | "createdAt" | "updatedAt">;

export type UserProfile = {
  id: string;
  nickname: string;
  username: string;
  avatar: string;
  annotationColor: string;
  updatedAt: string;
};

export type TextAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
};

export type Comment = {
  id: string;
  author: AnnotationAuthor;
  content: string;
  createdAt: string;
  replyTo?: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  pending?: boolean;
};

export type Annotation = {
  id: string;
  anchor: TextAnchor;
  author: AnnotationAuthor;
  annotationType?: AnnotationType;
  color: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleRecord = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  byline?: string;
  excerpt?: string;
  contentHash: string;
  annotations: Annotation[];
  createdAt: string;
  updatedAt: string;
};

export type DesktopStore = {
  user: UserProfile;
  providers: LlmProvider[];
  agents: Agent[];
  articles: ArticleRecord[];
};

export type AgentMessagePayload = {
  agentId?: string;
  agentUsername: string;
  article: {
    title: string;
    url: string;
    text: string;
  };
  annotation: Annotation;
  userComment: Comment;
};

export type AgentAnnotatePayload = {
  agentId?: string;
  agentUsername: string;
  article: {
    title: string;
    url: string;
    text: string;
  };
};

export type DesktopClientMessage =
  | { type: "hello" }
  | { type: "agent:list"; requestId: string }
  | { type: "article:save"; requestId: string; payload: ArticleRecord }
  | { type: "agent:message"; requestId: string; payload: AgentMessagePayload }
  | { type: "agent:annotate"; requestId: string; payload: AgentAnnotatePayload };

export type DesktopServerMessage =
  | { type: "status"; ok: boolean; user: UserProfile; agents: PublicAgent[] }
  | { type: "agent:list:result"; requestId: string; user: UserProfile; agents: PublicAgent[] }
  | { type: "agent:message:start"; requestId: string; annotationId: string; comment: Comment }
  | {
      type: "agent:message:delta";
      requestId: string;
      annotationId: string;
      commentId: string;
      delta: string;
    }
  | { type: "agent:message:done"; requestId: string; annotationId: string; commentId: string }
  | { type: "agent:message:result"; requestId: string; annotationId: string; comment: Comment }
  | { type: "agent:annotate:start"; requestId: string; agent: PublicAgent }
  | { type: "agent:annotate:item"; requestId: string; annotation: Annotation }
  | { type: "agent:annotate:done"; requestId: string }
  | { type: "agent:annotate:result"; requestId: string; annotations: Annotation[] }
  | { type: "error"; requestId?: string; message: string };

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function hashText(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function createTextAnchor(text: string, start: number, end: number): TextAnchor {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));

  return {
    exact: text.slice(safeStart, safeEnd),
    prefix: text.slice(Math.max(0, safeStart - 48), safeStart),
    suffix: text.slice(safeEnd, Math.min(text.length, safeEnd + 48)),
    start: safeStart,
    end: safeEnd,
  };
}

export function resolveTextAnchor(
  text: string,
  anchor: TextAnchor,
): { start: number; end: number } | null {
  if (!anchor.exact) return null;

  const direct = text.slice(anchor.start, anchor.end);
  if (direct === anchor.exact) {
    return { start: anchor.start, end: anchor.end };
  }

  const exactMatches = findAll(text, anchor.exact);
  if (exactMatches.length === 0) return null;
  if (exactMatches.length === 1) {
    const start = exactMatches[0];
    return { start, end: start + anchor.exact.length };
  }

  let bestStart = exactMatches[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const start of exactMatches) {
    const before = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = text.slice(
      start + anchor.exact.length,
      start + anchor.exact.length + anchor.suffix.length,
    );
    const score =
      commonSuffixLength(before, anchor.prefix) +
      commonPrefixLength(after, anchor.suffix) -
      Math.abs(start - anchor.start) / 100;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return { start: bestStart, end: bestStart + anchor.exact.length };
}

export function renderMarkdown(content: string): string {
  return renderMarkdownBlocks(content);
}

function renderMarkdownBlocks(content: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.match(/^```/)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].match(/^```/)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderMarkdownInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderParagraph(quoteLines)}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*[-*+]\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${renderParagraph(paragraphLines)}</p>`);
  }

  return blocks.join("");
}

function renderParagraph(lines: string[]) {
  return lines.map((line) => renderMarkdownInline(line)).join("<br>");
}

function renderMarkdownInline(content: string) {
  const tokens: string[] = [];
  const token = (value: string) => {
    const id = `@@YOMITOMO_MD_${tokens.length}@@`;
    tokens.push(value);
    return id;
  };

  let text = content.replace(/`([^`]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    if (!/^(https?:\/\/|mailto:)/i.test(href)) return escapeHtml(label);
    const safeHref = escapeHtml(href);
    return token(`<a href="${safeHref}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`);
  });

  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");

  tokens.forEach((value, index) => {
    text = text.replace(`@@YOMITOMO_MD_${index}@@`, value);
  });

  return text;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findAll(text: string, exact: string): number[] {
  const starts: number[] = [];
  let cursor = text.indexOf(exact);
  while (cursor >= 0) {
    starts.push(cursor);
    cursor = text.indexOf(exact, cursor + Math.max(1, exact.length));
  }
  return starts;
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return limit;
}

function commonSuffixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[left.length - 1 - index] !== right[right.length - 1 - index]) return index;
  }
  return limit;
}
