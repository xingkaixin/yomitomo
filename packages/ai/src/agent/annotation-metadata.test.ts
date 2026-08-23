import { describe, expect, it } from 'vitest';
import type { PublicAgent } from '@yomitomo/shared';
import { parseAgentMentionInstructions, parseAgentMentionRoutePlan } from './annotation-metadata';

const lin: PublicAgent = {
  id: 'agent_lin',
  kind: 'annotation',
  enabled: true,
  nickname: '林知微',
  username: '林知微',
  avatar: '',
  annotationColor: '#6fa48f',
  annotationDensity: 'medium',
  personalityName: '林知微',
  temperature: 0.35,
};
const zhou: PublicAgent = {
  ...lin,
  id: 'agent_zhou',
  nickname: '周砚',
  username: '周砚',
  personalityName: '周砚',
};

describe('agent annotation metadata', () => {
  it('parses per-agent mention instructions', () => {
    const instructions = parseAgentMentionInstructions(
      JSON.stringify([
        {
          agentUsername: '林知微',
          instruction: '解释这个概念',
          readingIntent: 'explain',
        },
      ]),
      [lin, zhou],
    );

    expect(instructions).toEqual([
      {
        agentId: lin.id,
        agentUsername: lin.username,
        action: 'comment',
        instruction: '解释这个概念',
        readingIntent: 'explain',
      },
      {
        agentId: zhou.id,
        agentUsername: zhou.username,
        action: 'comment',
      },
    ]);
  });

  it('parses mention route plans with multiple actions', () => {
    const route = parseAgentMentionRoutePlan(
      JSON.stringify({
        createUserThought: true,
        directives: [
          {
            agentUsername: '林知微',
            action: 'comment',
            instruction: '回应我的想法',
          },
          {
            agentUsername: '周砚',
            actions: ['comment', 'create_thought'],
            instruction: '从反方角度处理',
            readingIntent: 'challenge',
          },
        ],
      }),
      [lin, zhou],
    );

    expect(route).toEqual({
      createUserThought: true,
      directives: [
        {
          agentId: lin.id,
          agentUsername: lin.username,
          action: 'comment',
          instruction: '回应我的想法',
        },
        {
          agentId: zhou.id,
          agentUsername: zhou.username,
          action: 'comment',
          instruction: '从反方角度处理',
          readingIntent: 'challenge',
        },
        {
          agentId: zhou.id,
          agentUsername: zhou.username,
          action: 'create_thought',
          instruction: '从反方角度处理',
          readingIntent: 'challenge',
        },
      ],
    });
  });
});
