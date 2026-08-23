import type {
  AgentReadingIntent,
  Annotation,
  AnnotationAuthorRef,
  AnnotationType,
  Comment,
  PublicAgent,
  TextAnchor,
  UserProfile,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';

export type MentionQuery = {
  query: string;
  start: number;
  end: number;
};

export type CreateUserAnnotationOptions = {
  now?: string;
  replyTo?: string;
  readingIntent?: AgentReadingIntent;
};

export type AnnotationPersona = {
  avatar?: string;
  fallback: string;
  nickname: string;
  username: string;
  color: string;
};

export type AnnotationCommentThread = {
  root: Comment;
  replies: Comment[];
};

type AnnotationAgentIdentity = Pick<
  PublicAgent,
  'id' | 'username' | 'nickname' | 'avatar' | 'annotationColor'
>;

type AnnotationUserIdentity = Pick<
  UserProfile,
  'id' | 'username' | 'nickname' | 'avatar' | 'annotationColor'
>;

const annotationTypeLabels: Record<AnnotationType, string> = {
  key_point: '关键判断',
  assumption: '前提漏洞',
  concept: '概念解释',
  question: '延伸问题',
  quote: '金句',
};

export function annotationTypeLabel(type: AnnotationType) {
  return annotationTypeLabels[type];
}

export function createUserComment(
  user: UserProfile,
  content: string,
  options: CreateUserAnnotationOptions = {},
): Comment {
  const now = options.now || new Date().toISOString();

  return {
    id: makeId('comment'),
    author: annotationUserAuthorRef(user),
    content: content.trim(),
    createdAt: now,
    replyTo: options.replyTo,
    readingIntent: options.readingIntent,
  };
}

export function createUserAnnotation(
  anchor: TextAnchor,
  user: UserProfile,
  note: string,
  annotationType?: AnnotationType,
  options: CreateUserAnnotationOptions = {},
): Annotation {
  const now = options.now || new Date().toISOString();
  const trimmed = note.trim();

  return {
    id: makeId('annotation'),
    anchor,
    author: annotationUserAuthorRef(user),
    annotationType,
    readingIntent: options.readingIntent,
    color: user.annotationColor,
    comments: trimmed ? [createUserComment(user, trimmed, { ...options, now })] : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function annotationPrimaryComment(annotation: Annotation): Comment | null {
  const comment = annotation.comments[0];
  if (!comment) return null;
  if (!annotationAuthorsMatch(comment.author, annotation.author)) return null;
  if (comment.createdAt !== annotation.createdAt) return null;
  return comment;
}

export function annotationThreadComments(annotation: Annotation): Comment[] {
  return annotationPrimaryComment(annotation) ? annotation.comments.slice(1) : annotation.comments;
}

export function annotationThoughtComments(annotation: Annotation): Comment[] {
  return annotation.comments.filter((comment) => !comment.replyTo);
}

export function annotationCommentThreads(comments: Comment[]): AnnotationCommentThread[] {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const commentIndex = new Map(comments.map((comment, index) => [comment.id, index]));
  const rootByCommentId = new Map<string, string>();

  const resolveRootId = (comment: Comment) => {
    const resolved = rootByCommentId.get(comment.id);
    if (resolved) return resolved;

    const path: Comment[] = [];
    const pathIndex = new Map<string, number>();
    let current = comment;
    let rootId: string;

    while (true) {
      const knownRootId = rootByCommentId.get(current.id);
      if (knownRootId) {
        rootId = knownRootId;
        break;
      }

      const cycleStart = pathIndex.get(current.id);
      if (cycleStart !== undefined) {
        rootId = path
          .slice(cycleStart)
          .toSorted(
            (left, right) =>
              (commentIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
              (commentIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
          )[0].id;
        break;
      }

      pathIndex.set(current.id, path.length);
      path.push(current);
      if (!current.replyTo) {
        rootId = current.id;
        break;
      }

      const parent = commentsById.get(current.replyTo);
      if (!parent) {
        rootId = current.id;
        break;
      }
      current = parent;
    }

    for (const item of path) rootByCommentId.set(item.id, rootId);
    return rootId;
  };

  const rootIds = Array.from(new Set(comments.map(resolveRootId))).toSorted(
    (left, right) =>
      (commentIndex.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (commentIndex.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
  const threadsByRootId = new Map(
    rootIds.flatMap((rootId) => {
      const root = commentsById.get(rootId);
      return root ? [[rootId, { root, replies: [] as Comment[] }] as const] : [];
    }),
  );

  for (const comment of comments) {
    const rootId = rootByCommentId.get(comment.id);
    if (!rootId || rootId === comment.id) continue;
    threadsByRootId.get(rootId)?.replies.push(comment);
  }

  return rootIds.flatMap((rootId) => {
    const thread = threadsByRootId.get(rootId);
    return thread ? [thread] : [];
  });
}

export function appendAnnotationComment(
  annotations: Annotation[],
  annotationId: string,
  comment: Comment,
  now = new Date().toISOString(),
) {
  let found = false;
  const nextAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    found = true;
    return {
      ...annotation,
      comments: [...annotation.comments, comment],
      updatedAt: now,
    };
  });

  return found ? nextAnnotations : null;
}

export function updateAnnotationComment(
  annotations: Annotation[],
  annotationId: string,
  commentId: string,
  update: (comment: Comment) => Comment,
  now = new Date().toISOString(),
) {
  let found = false;
  const nextAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    found = true;
    return {
      ...annotation,
      comments: annotation.comments.map((comment) =>
        comment.id === commentId ? update(comment) : comment,
      ),
      updatedAt: now,
    };
  });

  return found ? nextAnnotations : null;
}

export function deleteAnnotationComment(
  annotations: Annotation[],
  annotationId: string,
  commentId: string,
  now = new Date().toISOString(),
) {
  let found = false;
  const nextAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;

    const deletedIds = new Set([commentId]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const comment of annotation.comments) {
        if (!comment.replyTo || !deletedIds.has(comment.replyTo) || deletedIds.has(comment.id)) {
          continue;
        }
        deletedIds.add(comment.id);
        expanded = true;
      }
    }

    const comments = annotation.comments.filter((comment) => !deletedIds.has(comment.id));
    if (comments.length === annotation.comments.length) return annotation;

    found = true;
    return {
      ...annotation,
      comments,
      updatedAt: now,
    };
  });

  return found ? nextAnnotations : null;
}

export function findMentionedAgents(content: string, agents: PublicAgent[]) {
  const byUsername = new Map(
    agents.flatMap((agent) => [[agent.username, agent] as const, [agent.nickname, agent] as const]),
  );
  const mentionedAgents: PublicAgent[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/@([\p{L}\p{N}_-]+)/gu)) {
    const username = match[1];
    const agent = byUsername.get(username);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    mentionedAgents.push(agent);
  }

  return mentionedAgents;
}

export function getMentionQuery(content: string, caretIndex: number): MentionQuery | null {
  const prefix = content.slice(0, caretIndex);
  const match = prefix.match(/(^|\s)@([\p{L}\p{N}_-]*)$/u);
  if (!match || match.index === undefined) return null;
  return {
    query: match[2],
    start: match.index + match[1].length,
    end: caretIndex,
  };
}

export function replaceMentionQuery(content: string, mentionQuery: MentionQuery, username: string) {
  return `${content.slice(0, mentionQuery.start)}@${username} ${content.slice(mentionQuery.end)}`;
}

export function annotationPersona(
  annotation: Annotation,
  userProfile: UserProfile,
  agents: PublicAgent[],
): AnnotationPersona {
  if (annotation.author.kind === 'agent') {
    const agent = findAgentIdentity(annotation.author.agentId, annotation.author.username, agents);
    return {
      avatar: agent?.avatar || annotation.author.avatar,
      fallback: 'AI',
      nickname: agent?.nickname || annotationAuthorName(annotation.author),
      username: agent?.username || annotation.author.username,
      color: agent?.annotationColor || annotation.author.annotationColor || annotation.color,
    };
  }

  const user = findUserIdentity(annotation.author.userId, userProfile);
  return {
    avatar: user?.avatar || annotation.author.avatar || userProfile.avatar,
    fallback: (user?.nickname || annotationAuthorName(annotation.author) || '我').slice(0, 1),
    nickname: user?.nickname || annotationAuthorName(annotation.author),
    username: user?.username || annotation.author.username,
    color:
      user?.annotationColor ||
      annotation.author.annotationColor ||
      annotation.color ||
      userProfile.annotationColor,
  };
}

export function commentPersona(
  comment: Comment,
  userProfile: UserProfile,
  agents: PublicAgent[],
): AnnotationPersona {
  if (comment.author.kind === 'agent') {
    const agent = findAgentIdentity(comment.author.agentId, comment.author.username, agents);
    return {
      avatar: agent?.avatar || comment.author.avatar,
      fallback: 'AI',
      nickname: agent?.nickname || annotationAuthorName(comment.author),
      username: agent?.username || comment.author.username,
      color:
        agent?.annotationColor || comment.author.annotationColor || userProfile.annotationColor,
    };
  }

  const user = findUserIdentity(comment.author.userId, userProfile);
  return {
    avatar: user?.avatar || comment.author.avatar || userProfile.avatar,
    fallback: (user?.nickname || annotationAuthorName(comment.author) || '我').slice(0, 1),
    nickname: user?.nickname || annotationAuthorName(comment.author),
    username: user?.username || comment.author.username,
    color: user?.annotationColor || comment.author.annotationColor || userProfile.annotationColor,
  };
}

export function annotationColor(
  annotation: Annotation,
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  return annotationPersona(annotation, userProfile, agents).color;
}

export function annotationToPublicAgent(annotation: Annotation): PublicAgent | undefined {
  if (annotation.author.kind !== 'agent') return undefined;
  return {
    id: annotation.author.agentId,
    kind: 'annotation',
    username: annotation.author.username,
    nickname: annotationAuthorName(annotation.author),
    avatar: annotation.author.avatar || 'AI',
    annotationColor: annotation.author.annotationColor || annotation.color,
    annotationDensity: 'medium',
    enabled: true,
    personalityName: '自定义个性',
    temperature: 0.35,
  };
}

export function annotationAuthorName(author: AnnotationAuthorRef) {
  return author.nickname || author.username;
}

export function annotationAgentAuthorRef(
  agent: AnnotationAgentIdentity,
): Extract<AnnotationAuthorRef, { kind: 'agent' }> {
  return {
    kind: 'agent',
    agentId: agent.id,
    username: agent.username,
    nickname: agent.nickname,
    avatar: agent.avatar,
    annotationColor: agent.annotationColor,
  };
}

export function annotationUserAuthorRef(
  user: AnnotationUserIdentity,
): Extract<AnnotationAuthorRef, { kind: 'user' }> {
  return {
    kind: 'user',
    userId: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    annotationColor: user.annotationColor,
  };
}

function annotationAuthorsMatch(left: AnnotationAuthorRef, right: AnnotationAuthorRef) {
  if (left.kind === 'agent' && right.kind === 'agent') {
    return left.agentId === right.agentId;
  }
  if (left.kind === 'user' && right.kind === 'user') {
    if (left.userId && right.userId) return left.userId === right.userId;
    return left.username === right.username;
  }
  return false;
}

function findAgentIdentity(
  agentId: string | undefined,
  username: string | undefined,
  agents: PublicAgent[],
) {
  return (
    agents.find((agent) => agent.id === agentId) ||
    agents.find((agent) => agent.username === username)
  );
}

function findUserIdentity(userId: string | undefined, userProfile: UserProfile) {
  return !userId || userId === userProfile.id ? userProfile : null;
}
