import type {
  Agent,
  AgentAnnotationDensity,
  Annotation,
  AnnotationType,
  Comment,
  PublicAgent,
  TextAnchor,
  UserProfile,
} from '@yomitomo/shared';
import { createTextAnchor, makeId } from '@yomitomo/shared';

export type AnnotationSuggestion = {
  exact: string;
  comment: string;
  annotationType?: AnnotationType | null;
};

export type MentionQuery = {
  query: string;
  start: number;
  end: number;
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

export function normalizeAnnotationType(value: unknown): AnnotationType | null {
  return value === 'key_point' ||
    value === 'assumption' ||
    value === 'concept' ||
    value === 'question' ||
    value === 'quote'
    ? value
    : null;
}

export function createUserComment(
  user: UserProfile,
  content: string,
  now = new Date().toISOString(),
): Comment {
  return {
    id: makeId('comment'),
    author: 'user',
    content: content.trim(),
    createdAt: now,
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
  now = new Date().toISOString(),
): Annotation {
  const trimmed = note.trim();

  return {
    id: makeId('annotation'),
    anchor,
    author: 'user',
    annotationType,
    color: user.annotationColor,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
    comments: trimmed ? [createUserComment(user, trimmed, now)] : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createAgentAnnotation(
  agent: Agent,
  articleText: string,
  suggestion: AnnotationSuggestion,
  now = new Date().toISOString(),
): Annotation | null {
  const exact = suggestion.exact.trim();
  const start = articleText.indexOf(exact);
  if (start < 0) return null;

  const comment = suggestion.comment.trim();
  return {
    id: makeId('annotation'),
    anchor: createTextAnchor(articleText, start, start + exact.length),
    author: 'ai',
    annotationType: suggestion.annotationType || 'key_point',
    color: agent.annotationColor,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    comments: comment
      ? [
          {
            id: makeId('comment'),
            author: 'ai',
            content: comment,
            createdAt: now,
            agentId: agent.id,
            agentUsername: agent.username,
            agentNickname: agent.nickname,
            agentAvatar: agent.avatar,
            agentAnnotationColor: agent.annotationColor,
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
  };
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

export function findMentionedAgents(content: string, agents: PublicAgent[]) {
  const byUsername = new Map(agents.map((agent) => [agent.username, agent]));
  const mentionedAgents: PublicAgent[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(/@([a-zA-Z0-9_-]+)/g)) {
    const username = match[1];
    const agent = byUsername.get(username);
    if (!agent || seen.has(username)) continue;
    seen.add(username);
    mentionedAgents.push(agent);
  }

  return mentionedAgents;
}

export function getMentionQuery(content: string, caretIndex: number): MentionQuery | null {
  const prefix = content.slice(0, caretIndex);
  const match = prefix.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
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
    fallback: '我',
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
    fallback: '我',
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
    temperature: 0.35,
  };
}

export function parseAnnotationSuggestions(content: string): AnnotationSuggestion[] {
  const json = content.match(/\[[\s\S]*\]/)?.[0] || content;
  const parsed = JSON.parse(json) as Array<{ exact?: unknown; comment?: unknown; type?: unknown }>;
  return parsed
    .map((item) => ({
      exact: typeof item.exact === 'string' ? item.exact : '',
      comment: typeof item.comment === 'string' ? item.comment : '',
      annotationType: normalizeAnnotationType(item.type),
    }))
    .filter((item) => item.exact.trim().length > 0);
}

export function annotationDensityInstruction(density: AgentAnnotationDensity) {
  if (density === 'low') return '克制，约 2-4 条，只选择最高价值片段。';
  if (density === 'high') return '积极，约 7-12 条，覆盖更多值得讨论的片段。';
  return '标准，约 4-7 条，保持覆盖和克制的平衡。';
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
