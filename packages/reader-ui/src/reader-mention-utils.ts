import type { PublicAgent } from '@yomitomo/shared';
import { getMentionQuery, replaceMentionQuery } from '@yomitomo/core';

export type MentionChipSegment =
  | {
      text: string;
      type: 'text';
    }
  | {
      agent: PublicAgent;
      source: 'mention' | 'name';
      text: string;
      type: 'agent';
    };

export function mentionDraftWithAgent(
  content: string,
  username: string,
  mentionQuery: ReturnType<typeof getMentionQuery>,
) {
  if (mentionQuery) {
    const nextContent = replaceMentionQuery(content, mentionQuery, username);
    return {
      content: nextContent,
      caretIndex: mentionQuery.start + username.length + 2,
    };
  }

  const prefix = content.trimEnd();
  const nextContent = `${prefix ? `${prefix} ` : ''}@${username} `;
  return {
    content: nextContent,
    caretIndex: nextContent.length,
  };
}

export function matchesAgentMentionQuery(agent: PublicAgent, query: string) {
  const normalizedQuery = normalizeMentionSearch(query);
  if (!normalizedQuery) return true;

  return [agent.username, agent.nickname, agent.pinyin || ''].some((value) =>
    normalizeMentionSearch(value).includes(normalizedQuery),
  );
}

export function normalizeMentionSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasMatchedAgentMention(content: string, agents: PublicAgent[]) {
  return mentionChipSegments(content, agents, { includeNameMatches: false }).some(
    (segment) => segment.type === 'agent',
  );
}

export function mentionChipSegments(
  content: string,
  agents: PublicAgent[],
  options: { includeNameMatches?: boolean } = {},
): MentionChipSegment[] {
  if (!content) return [];

  const mentionAgents = mentionAgentMap(agents);
  const nameAgents = options.includeNameMatches ? uniqueNameAgents(agents) : [];
  const segments: MentionChipSegment[] = [];
  let offset = 0;

  while (offset < content.length) {
    const match = nextMentionChipMatch(content, offset, mentionAgents, nameAgents);
    if (!match) {
      pushTextSegment(segments, content.slice(offset));
      break;
    }

    if (match.start > offset) pushTextSegment(segments, content.slice(offset, match.start));
    segments.push({
      type: 'agent',
      text: match.text,
      agent: match.agent,
      source: match.source,
    });
    offset = match.end;
  }

  return segments;
}

type MentionChipMatch = {
  agent: PublicAgent;
  end: number;
  source: 'mention' | 'name';
  start: number;
  text: string;
};

function nextMentionChipMatch(
  content: string,
  offset: number,
  mentionAgents: Map<string, PublicAgent>,
  nameAgents: { agent: PublicAgent; name: string }[],
): MentionChipMatch | null {
  const mention = nextMentionMatch(content, offset, mentionAgents);
  const name = nextNameMatch(content, offset, nameAgents);
  if (!mention) return name;
  if (!name) return mention;
  if (mention.start !== name.start) return mention.start < name.start ? mention : name;
  return mention.text.length >= name.text.length ? mention : name;
}

function nextMentionMatch(
  content: string,
  offset: number,
  mentionAgents: Map<string, PublicAgent>,
): MentionChipMatch | null {
  const mentionPattern = /@([\p{L}\p{N}_-]+)/gu;
  mentionPattern.lastIndex = offset;

  for (const match of content.matchAll(mentionPattern)) {
    const handle = match[1];
    const start = match.index;
    if (!handle) continue;
    if (start === undefined) continue;
    const agent = mentionAgents.get(handle);
    if (!agent) continue;
    const text = match[0];
    return {
      source: 'mention',
      text,
      agent,
      start,
      end: start + text.length,
    };
  }

  return null;
}

function nextNameMatch(
  content: string,
  offset: number,
  nameAgents: { agent: PublicAgent; name: string }[],
): MentionChipMatch | null {
  let next: MentionChipMatch | null = null;

  for (const { agent, name } of nameAgents) {
    const start = content.indexOf(name, offset);
    if (start < 0) continue;
    if (next && (start > next.start || (start === next.start && name.length <= next.text.length)))
      continue;
    next = {
      source: 'name',
      text: name,
      agent,
      start,
      end: start + name.length,
    };
  }

  return next;
}

function mentionAgentMap(agents: PublicAgent[]) {
  const byHandle = new Map<string, PublicAgent>();

  for (const agent of agents) {
    if (agent.username) byHandle.set(agent.username, agent);
    if (agent.nickname) byHandle.set(agent.nickname, agent);
  }

  return byHandle;
}

function uniqueNameAgents(agents: PublicAgent[]) {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    const name = agent.nickname.trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }

  return agents
    .map((agent) => ({ agent, name: agent.nickname.trim() }))
    .filter(({ name }) => name && counts.get(name) === 1)
    .toSorted((left, right) => right.name.length - left.name.length);
}

function pushTextSegment(segments: MentionChipSegment[], text: string) {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous?.type === 'text') {
    previous.text += text;
    return;
  }
  segments.push({ type: 'text', text });
}
