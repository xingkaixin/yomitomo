export type AnnotationAuthor = 'user' | 'ai';

export type ProviderType = 'openai' | 'anthropic' | 'gemini';

export type AnnotationType = 'key_point' | 'assumption' | 'concept' | 'question' | 'quote';

export type AgentAnnotationDensity = 'low' | 'medium' | 'high';

export type AgentKind = 'annotation' | 'review';

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
  kind: AgentKind;
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

export type PublicAgent = Omit<Agent, 'providerId' | 'soul' | 'createdAt' | 'updatedAt'>;

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
  contentHtml?: string;
  contentHash: string;
  annotations: Annotation[];
  readingDeliberation?: ReadingDeliberationRecord;
  readingCard?: ReadingCardRecord;
  createdAt: string;
  updatedAt: string;
};

export type ReadingDeliberationSection = {
  title: string;
  content: string;
};

export type ReadingDeliberationRecord = {
  id: string;
  articleId: string;
  title: string;
  contentMarkdown: string;
  sections: ReadingDeliberationSection[];
  providerId: string;
  providerName: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadingCardSection = {
  title: string;
  content: string;
};

export type ReadingCardReviewVerdict = 'pass' | 'revise';

export type ReadingCardReviewSeverity = 'high' | 'medium' | 'low';

export type ReadingCardReviewFinding = {
  section: string;
  severity: ReadingCardReviewSeverity;
  problem: string;
  evidenceIds: number[];
  suggestedRewrite?: string;
};

export type ReadingCardReviewerResult = {
  id: string;
  reviewerId: string;
  reviewerNickname: string;
  reviewerUsername: string;
  reviewerAvatar: string;
  reviewerColor: string;
  verdict: ReadingCardReviewVerdict;
  summary: string;
  findings: ReadingCardReviewFinding[];
  acceptedClaims: string[];
  missingAngles: string[];
  rawResponse?: string;
  createdAt: string;
};

export type ReadingCardReviewRecord = {
  id: string;
  articleId: string;
  readingCardId: string;
  reviewerResults: ReadingCardReviewerResult[];
  createdAt: string;
  updatedAt: string;
};

export type ReadingCardRecord = {
  id: string;
  articleId: string;
  title: string;
  contentMarkdown: string;
  sections: ReadingCardSection[];
  review?: ReadingCardReviewRecord;
  providerId: string;
  providerName: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  defaultProviderId?: string;
};

export type DesktopStore = {
  user: UserProfile;
  settings: AppSettings;
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
  | { type: 'auth'; token: string }
  | { type: 'hello' }
  | { type: 'agent:list'; requestId: string }
  | {
      type: 'article:get';
      requestId: string;
      payload: { id: string; url: string; canonicalUrl: string };
    }
  | { type: 'article:save'; requestId: string; payload: ArticleRecord }
  | { type: 'agent:message'; requestId: string; payload: AgentMessagePayload }
  | { type: 'agent:annotate'; requestId: string; payload: AgentAnnotatePayload };

export type DesktopServerMessage =
  | { type: 'auth:result'; ok: boolean; message?: string; pairingId?: string }
  | { type: 'status'; ok: boolean; user: UserProfile; agents: PublicAgent[]; pairingId: string }
  | { type: 'agent:list:result'; requestId: string; user: UserProfile; agents: PublicAgent[] }
  | { type: 'article:get:result'; requestId: string; article: ArticleRecord | null }
  | { type: 'article:updated'; article: ArticleRecord }
  | { type: 'agent:message:start'; requestId: string; annotationId: string; comment: Comment }
  | {
      type: 'agent:message:delta';
      requestId: string;
      annotationId: string;
      commentId: string;
      delta: string;
    }
  | { type: 'agent:message:done'; requestId: string; annotationId: string; commentId: string }
  | { type: 'agent:message:result'; requestId: string; annotationId: string; comment: Comment }
  | { type: 'agent:annotate:start'; requestId: string; agent: PublicAgent }
  | { type: 'agent:annotate:item'; requestId: string; annotation: Annotation }
  | { type: 'agent:annotate:done'; requestId: string }
  | { type: 'agent:annotate:result'; requestId: string; annotations: Annotation[] }
  | { type: 'error'; requestId?: string; message: string };

export type DesktopClientMessageParseError = {
  requestId?: string;
  message: string;
};

export type DesktopClientMessageParseResult =
  | { ok: true; message: DesktopClientMessage }
  | { ok: false; error: DesktopClientMessageParseError };

const MESSAGE_LIMITS = {
  tokenChars: 512,
  requestIdChars: 128,
  idChars: 256,
  usernameChars: 64,
  urlChars: 4096,
  titleChars: 512,
  bylineChars: 512,
  excerptChars: 2000,
  contentHtmlChars: 2_000_000,
  articleTextChars: 300_000,
  annotations: 1000,
  commentsPerAnnotation: 200,
  commentChars: 20_000,
  anchorExactChars: 20_000,
  anchorContextChars: 2000,
};

export function parseDesktopClientMessage(value: unknown): DesktopClientMessageParseResult {
  if (!isPlainObject(value)) return parseError(undefined, '消息必须是 JSON object');

  const type = value.type;
  const requestId = optionalBoundedString(value.requestId, MESSAGE_LIMITS.requestIdChars);
  if (requestId === false) return parseError(undefined, 'requestId 超出长度限制');

  if (type === 'auth') {
    if (!boundedString(value.token, MESSAGE_LIMITS.tokenChars)) {
      return parseError(undefined, 'auth.token 必须是非空字符串');
    }
    return { ok: true, message: value as { type: 'auth'; token: string } };
  }

  if (type === 'hello') return { ok: true, message: { type: 'hello' } };

  if (!requestId) return parseError(undefined, 'requestId 必须是非空字符串');

  if (type === 'agent:list') {
    return { ok: true, message: value as { type: 'agent:list'; requestId: string } };
  }

  if (type === 'article:get') {
    if (!isPlainObject(value.payload)) return parseError(requestId, 'article:get.payload 缺失');
    const payload = value.payload;
    if (!boundedString(payload.id, MESSAGE_LIMITS.idChars)) {
      return parseError(requestId, 'article:get.payload.id 必须是非空字符串');
    }
    if (!isHttpUrl(payload.url) || !isHttpUrl(payload.canonicalUrl)) {
      return parseError(requestId, 'article:get URL 必须是 http 或 https');
    }
    return { ok: true, message: value as DesktopClientMessage };
  }

  if (type === 'article:save') {
    const error = validateArticleRecord(value.payload);
    if (error) return parseError(requestId, error);
    return { ok: true, message: value as DesktopClientMessage };
  }

  if (type === 'agent:message') {
    const error = validateAgentMessagePayload(value.payload);
    if (error) return parseError(requestId, error);
    return { ok: true, message: value as DesktopClientMessage };
  }

  if (type === 'agent:annotate') {
    const error = validateAgentAnnotatePayload(value.payload);
    if (error) return parseError(requestId, error);
    return { ok: true, message: value as DesktopClientMessage };
  }

  return parseError(requestId, '未知消息类型');
}

export function isDesktopSocketOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return true;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  } catch {
    return false;
  }

  return false;
}

function validateAgentMessagePayload(value: unknown) {
  if (!isPlainObject(value)) return 'agent:message.payload 缺失';
  if (!validateAgentIdentity(value)) return 'Agent 标识必须包含有效 username';
  const articleError = validatePromptArticle(value.article);
  if (articleError) return `agent:message.${articleError}`;
  const annotationError = validateAnnotation(value.annotation);
  if (annotationError) return `agent:message.annotation ${annotationError}`;
  const commentError = validateComment(value.userComment);
  if (commentError) return `agent:message.userComment ${commentError}`;
  return '';
}

function validateAgentAnnotatePayload(value: unknown) {
  if (!isPlainObject(value)) return 'agent:annotate.payload 缺失';
  if (!validateAgentIdentity(value)) return 'Agent 标识必须包含有效 username';
  const articleError = validatePromptArticle(value.article);
  return articleError ? `agent:annotate.${articleError}` : '';
}

function validateAgentIdentity(value: Record<string, unknown>) {
  return (
    optionalBoundedString(value.agentId, MESSAGE_LIMITS.idChars) !== false &&
    boundedString(value.agentUsername, MESSAGE_LIMITS.usernameChars)
  );
}

function validatePromptArticle(value: unknown) {
  if (!isPlainObject(value)) return 'article 缺失';
  if (!boundedString(value.title, MESSAGE_LIMITS.titleChars)) return 'article.title 无效';
  if (!isHttpUrl(value.url)) return 'article.url 必须是 http 或 https';
  if (!boundedString(value.text, MESSAGE_LIMITS.articleTextChars)) {
    return 'article.text 超出传输容量边界';
  }
  return '';
}

function validateArticleRecord(value: unknown) {
  if (!isPlainObject(value)) return 'article:save.payload 缺失';
  if (!boundedString(value.id, MESSAGE_LIMITS.idChars)) return 'article.id 无效';
  if (!isHttpUrl(value.url) || !isHttpUrl(value.canonicalUrl)) {
    return 'article URL 必须是 http 或 https';
  }
  if (!boundedString(value.title, MESSAGE_LIMITS.titleChars)) return 'article.title 无效';
  if (optionalBoundedString(value.byline, MESSAGE_LIMITS.bylineChars) === false) {
    return 'article.byline 超出长度限制';
  }
  if (optionalBoundedString(value.excerpt, MESSAGE_LIMITS.excerptChars) === false) {
    return 'article.excerpt 超出长度限制';
  }
  if (optionalBoundedString(value.contentHtml, MESSAGE_LIMITS.contentHtmlChars) === false) {
    return 'article.contentHtml 超出存储容量边界';
  }
  if (!boundedString(value.contentHash, MESSAGE_LIMITS.idChars)) return 'article.contentHash 无效';
  if (!Array.isArray(value.annotations)) return 'article.annotations 必须是数组';
  if (value.annotations.length > MESSAGE_LIMITS.annotations) {
    return 'article.annotations 超出数量限制';
  }
  for (const annotation of value.annotations) {
    const error = validateAnnotation(annotation);
    if (error) return `article.annotations ${error}`;
  }
  if (!boundedString(value.createdAt, MESSAGE_LIMITS.idChars)) return 'article.createdAt 无效';
  if (!boundedString(value.updatedAt, MESSAGE_LIMITS.idChars)) return 'article.updatedAt 无效';
  return '';
}

function validateAnnotation(value: unknown) {
  if (!isPlainObject(value)) return '元素必须是 object';
  if (!boundedString(value.id, MESSAGE_LIMITS.idChars)) return 'id 无效';
  if (!isPlainObject(value.anchor)) return 'anchor 缺失';
  if (!boundedString(value.anchor.exact, MESSAGE_LIMITS.anchorExactChars)) {
    return 'anchor.exact 无效';
  }
  if (!limitedString(value.anchor.prefix, MESSAGE_LIMITS.anchorContextChars)) {
    return 'anchor.prefix 无效';
  }
  if (!limitedString(value.anchor.suffix, MESSAGE_LIMITS.anchorContextChars)) {
    return 'anchor.suffix 无效';
  }
  if (!Number.isFinite(value.anchor.start) || !Number.isFinite(value.anchor.end)) {
    return 'anchor start/end 无效';
  }
  if (value.author !== 'user' && value.author !== 'ai') return 'author 无效';
  if (!boundedString(value.color, MESSAGE_LIMITS.idChars)) return 'color 无效';
  if (!Array.isArray(value.comments)) return 'comments 必须是数组';
  if (value.comments.length > MESSAGE_LIMITS.commentsPerAnnotation) {
    return 'comments 超出数量限制';
  }
  for (const comment of value.comments) {
    const error = validateComment(comment);
    if (error) return `comment ${error}`;
  }
  if (!boundedString(value.createdAt, MESSAGE_LIMITS.idChars)) return 'createdAt 无效';
  if (!boundedString(value.updatedAt, MESSAGE_LIMITS.idChars)) return 'updatedAt 无效';
  return '';
}

function validateComment(value: unknown) {
  if (!isPlainObject(value)) return '必须是 object';
  if (!boundedString(value.id, MESSAGE_LIMITS.idChars)) return 'id 无效';
  if (value.author !== 'user' && value.author !== 'ai') return 'author 无效';
  if (!limitedString(value.content, MESSAGE_LIMITS.commentChars)) {
    return 'content 超出长度限制';
  }
  if (!boundedString(value.createdAt, MESSAGE_LIMITS.idChars)) return 'createdAt 无效';
  return '';
}

function parseError(
  requestId: string | undefined,
  message: string,
): { ok: false; error: DesktopClientMessageParseError } {
  return { ok: false, error: { requestId, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function limitedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function optionalBoundedString(value: unknown, maxLength: number): string | undefined | false {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > maxLength) return false;
  return value;
}

function isHttpUrl(value: unknown) {
  if (!boundedString(value, MESSAGE_LIMITS.urlChars)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

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
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
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
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
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
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${renderParagraph(quoteLines)}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith('```') &&
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

  return blocks.join('');
}

function renderParagraph(lines: string[]) {
  return lines.map((line) => renderMarkdownInline(line)).join('<br>');
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
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

  tokens.forEach((value, index) => {
    text = text.replace(`@@YOMITOMO_MD_${index}@@`, value);
  });

  return text;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
