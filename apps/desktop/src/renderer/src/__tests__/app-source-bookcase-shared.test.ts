import { describe, expect, it, vi } from 'vitest';
import type { AgentMentionRoutePlan, Annotation, PublicAgent } from '@yomitomo/shared';
import {
  agentInstructionFromNote,
  planSelectionMentionRoute,
  routeFocusReadingPlanMessages,
  targetAnchorReadingPlan,
} from '../app-source-bookcase-shared';

function agent(overrides: Partial<PublicAgent> = {}): PublicAgent {
  return {
    id: 'agent_lin',
    kind: 'annotation',
    presetId: 'lin',
    enabled: true,
    nickname: 'lin',
    username: 'lin',
    avatar: '',
    annotationColor: '#8a8f4f',
    annotationDensity: 'medium',
    temperature: 0.4,
    personalityName: 'Lin',
    ...overrides,
  };
}

describe('agentInstructionFromNote', () => {
  it('removes mentioned agent handles from the note instruction', () => {
    expect(agentInstructionFromNote('@lin 解释这里', [agent()])).toBe('解释这里');
  });

  it('uses both username and nickname as mention handles', () => {
    expect(agentInstructionFromNote('@reader 总结一下', [agent({ nickname: 'reader' })])).toBe(
      '总结一下',
    );
  });
});

describe('targetAnchorReadingPlan', () => {
  const anchor: Annotation['anchor'] = {
    exact: '原文',
    prefix: '',
    suffix: '',
    start: 4,
    end: 8,
  };

  it('returns an empty plan without a target anchor', () => {
    expect(targetAnchorReadingPlan(undefined, 'explain')).toEqual([]);
  });

  it('builds a single-section plan for the selected anchor', () => {
    expect(targetAnchorReadingPlan(anchor, 'challenge')).toEqual([
      {
        sectionId: 'target-selection',
        sectionTitle: '选区',
        sectionStart: 4,
        sectionEnd: 8,
        readingIntent: 'challenge',
      },
    ]);
  });
});

describe('planSelectionMentionRoute', () => {
  const anchor: Annotation['anchor'] = {
    exact: '原文',
    prefix: '',
    suffix: '',
    start: 4,
    end: 8,
  };

  it('does not call the gate without mentioned agents', async () => {
    const desktop = { planAgentMentionRoute: vi.fn() };
    const route = await planSelectionMentionRoute({
      desktop,
      note: '我的想法',
      targetAnchor: anchor,
      agents: [],
      article: { title: '标题', url: '', text: '正文' },
    });

    expect(route).toEqual({ createUserThought: true, directives: [] });
    expect(desktop.planAgentMentionRoute).not.toHaveBeenCalled();
  });

  it('does not create a user thought for pure mentions when the gate is unavailable', async () => {
    const lin = agent();
    const zhou = agent({ id: 'agent_zhou', username: 'zhou', nickname: 'zhou' });

    const route = await planSelectionMentionRoute({
      desktop: undefined,
      note: '@lin @zhou',
      targetAnchor: anchor,
      agents: [lin, zhou],
      article: { title: '标题', url: '', text: '正文' },
    });

    expect(route.createUserThought).toBe(false);
    expect(route.directives).toEqual([
      {
        agentId: lin.id,
        agentUsername: lin.username,
        action: 'comment',
        instruction: undefined,
      },
      {
        agentId: zhou.id,
        agentUsername: zhou.username,
        action: 'comment',
        instruction: undefined,
      },
    ]);
  });
});

describe('routeFocusReadingPlanMessages', () => {
  it('routes mentioned section messages as create-thought instructions', async () => {
    const lin = agent();
    const zhou = agent({ id: 'agent_zhou', username: 'zhou', nickname: 'zhou' });
    const route: AgentMentionRoutePlan = {
      createUserThought: false,
      directives: [
        {
          agentId: zhou.id,
          agentUsername: zhou.username,
          action: 'create_thought',
          instruction: '提出反方想法',
          readingIntent: 'challenge',
        },
      ],
    };
    const desktop = { planAgentMentionRoute: vi.fn(async () => route) };

    const readingPlan = await routeFocusReadingPlanMessages({
      desktop,
      agent: zhou,
      agents: [lin, zhou],
      article: { title: '标题', url: '', text: '这是一段章节正文。' },
      readingPlan: [
        {
          sectionId: 's1',
          sectionTitle: '第一节',
          sectionStart: 0,
          sectionEnd: 8,
          messages: [
            {
              content: '@lin 解释一下，@zhou 从反方看',
            },
          ],
        },
      ],
    });

    expect(readingPlan[0]?.messages?.map((message) => message.content)).toEqual(['提出反方想法']);
    expect(desktop.planAgentMentionRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedActions: ['create_thought'],
        agents: [lin, zhou],
      }),
    );
  });
});
