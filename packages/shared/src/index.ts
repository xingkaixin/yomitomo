export type AnnotationAuthor = "user" | "ai";

export type ProviderType = "openai" | "anthropic" | "gemini";

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
  | { type: "agent:message"; requestId: string; payload: AgentMessagePayload }
  | { type: "agent:annotate"; requestId: string; payload: AgentAnnotatePayload };

export type DesktopServerMessage =
  | { type: "status"; ok: boolean; user: UserProfile; agents: PublicAgent[] }
  | { type: "agent:list:result"; requestId: string; user: UserProfile; agents: PublicAgent[] }
  | { type: "agent:message:start"; requestId: string; annotationId: string; comment: Comment }
  | { type: "agent:message:delta"; requestId: string; annotationId: string; commentId: string; delta: string }
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
    end: safeEnd
  };
}

export function resolveTextAnchor(text: string, anchor: TextAnchor): { start: number; end: number } | null {
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
    const after = text.slice(start + anchor.exact.length, start + anchor.exact.length + anchor.suffix.length);
    const score = commonSuffixLength(before, anchor.prefix) + commonPrefixLength(after, anchor.suffix) - Math.abs(start - anchor.start) / 100;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return { start: bestStart, end: bestStart + anchor.exact.length };
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
