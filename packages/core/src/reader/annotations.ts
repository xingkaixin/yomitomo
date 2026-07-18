import type {
  AgentReadingIntent,
  Annotation,
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

export const annotationTypeLabels: Record<AnnotationType, string> = {
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
    author: 'user',
    content: content.trim(),
    createdAt: now,
    replyTo: options.replyTo,
    readingIntent: options.readingIntent,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
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
    author: 'user',
    annotationType,
    readingIntent: options.readingIntent,
    color: user.annotationColor,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
    comments: trimmed ? [createUserComment(user, trimmed, { ...options, now })] : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function annotationPrimaryComment(annotation: Annotation): Comment | null {
  const comment = annotation.comments[0];
  if (!comment) return null;
  if (comment.author !== annotation.author) return null;
  if (comment.createdAt !== annotation.createdAt) return null;
  return comment;
}

export function annotationThreadComments(annotation: Annotation): Comment[] {
  return annotationPrimaryComment(annotation) ? annotation.comments.slice(1) : annotation.comments;
}

export function annotationThoughtComments(annotation: Annotation): Comment[] {
  return annotation.comments.filter((comment) => !comment.replyTo);
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
  if (annotation.author === 'ai') {
    const agent = findAgentIdentity(annotation.agentId, annotation.agentUsername, agents);
    return {
      avatar: agent?.avatar || annotation.agentAvatar,
      fallback: 'AI',
      nickname: agent?.nickname || annotation.agentNickname || annotation.agentUsername || 'Agent',
      username: agent?.username || annotation.agentUsername || 'agent',
      color: agent?.annotationColor || annotation.agentAnnotationColor || annotation.color,
    };
  }

  const user = findUserIdentity(annotation.userId, userProfile);
  return {
    avatar: user?.avatar || annotation.userAvatar || userProfile.avatar,
    fallback: (user?.nickname || annotation.userNickname || userProfile.nickname || '我').slice(
      0,
      1,
    ),
    nickname: user?.nickname || annotation.userNickname || userProfile.nickname,
    username: user?.username || annotation.userUsername || userProfile.username,
    color:
      user?.annotationColor ||
      annotation.userAnnotationColor ||
      annotation.color ||
      userProfile.annotationColor,
  };
}

export function commentPersona(
  comment: Comment,
  userProfile: UserProfile,
  agents: PublicAgent[],
): AnnotationPersona {
  if (comment.author === 'ai') {
    const agent = findAgentIdentity(comment.agentId, comment.agentUsername, agents);
    return {
      avatar: agent?.avatar || comment.agentAvatar,
      fallback: 'AI',
      nickname: agent?.nickname || comment.agentNickname || comment.agentUsername || 'Agent',
      username: agent?.username || comment.agentUsername || 'agent',
      color: agent?.annotationColor || comment.agentAnnotationColor || userProfile.annotationColor,
    };
  }

  const user = findUserIdentity(comment.userId, userProfile);
  return {
    avatar: user?.avatar || comment.userAvatar || userProfile.avatar,
    fallback: (user?.nickname || comment.userNickname || userProfile.nickname || '我').slice(0, 1),
    nickname: user?.nickname || comment.userNickname || userProfile.nickname,
    username: user?.username || comment.userUsername || userProfile.username,
    color: user?.annotationColor || comment.userAnnotationColor || userProfile.annotationColor,
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
  if (!annotation.agentId || !annotation.agentUsername) return undefined;
  return {
    id: annotation.agentId,
    kind: 'annotation',
    username: annotation.agentUsername,
    nickname: annotation.agentNickname || annotation.agentUsername,
    avatar: annotation.agentAvatar || 'AI',
    annotationColor: annotation.agentAnnotationColor || annotation.color,
    annotationDensity: 'medium',
    enabled: true,
    personalityName: '自定义个性',
    temperature: 0.35,
  };
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
