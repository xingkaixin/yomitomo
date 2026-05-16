import type { PublicAgent } from '@yomitomo/shared';
import { getMentionQuery, replaceMentionQuery } from '@yomitomo/core';

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
