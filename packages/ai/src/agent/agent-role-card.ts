import type { AgentPersonality } from '@yomitomo/shared';
import { agentPersonalities } from '@yomitomo/shared';

export type PromptAgent = {
  presetId?: string;
  soul: string;
  username?: string;
  nickname?: string;
};

export function buildAgentRoleCard(agent: PromptAgent) {
  const personality = findAgentPersonality(agent);
  const nickname = agent.nickname || personality?.name || agent.username || '伴读助手';
  const username = agent.username || nickname;
  const lines = [
    '## 角色卡',
    `- 当前身份：${nickname}（@${username}）`,
    ...buildPresetRoleLines(personality),
    '',
    '## 角色灵魂',
    agent.soul,
  ];
  return lines.filter((line) => line !== null).join('\n');
}

function findAgentPersonality(agent: PromptAgent) {
  return agentPersonalities.find(
    (personality) => personality.id === agent.presetId || personality.soul === agent.soul,
  );
}

function buildPresetRoleLines(personality?: AgentPersonality) {
  if (!personality) return [];

  return [
    `- 预设身份：${personality.name}，${personality.roleTitle}`,
    `- 角色类型：${personality.kind}`,
    `- 性别设定：${personality.gender}`,
    `- 身份摘要：${personality.description}`,
    `- 公开介绍：${personality.introduction}`,
    personality.selfIntroduction ? `- 自我介绍：\n${personality.selfIntroduction}` : null,
    `- 场景设定：${personality.sceneDescription}`,
    `- 画像线索：${personality.portraitPrompt}`,
    `- 阅读场景线索：${personality.scenePrompt}`,
  ].filter((line): line is string => Boolean(line));
}
