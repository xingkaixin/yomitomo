import { describe, expect, it } from 'vitest';
import type {
  FocusCoReadingMessage,
  FocusCoReadingSectionPlan,
  PublicAgent,
} from '@yomitomo/shared';
import {
  filterFocusMessageTargetsForAgents,
  focusSectionToReadingPlanItem,
  normalizeFocusSectionPlans,
} from './reader-agent-annotate-utils';
import type { ReaderReadingSection } from './reader-types';

function agent(id: string, nickname: string): PublicAgent {
  return {
    id,
    kind: 'annotation',
    enabled: true,
    nickname,
    username: id,
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    personalityName: nickname,
    temperature: 0.3,
  };
}

const agents = [agent('agent_1', '林知微'), agent('agent_2', '周砚')];

describe('reader agent annotate utils', () => {
  it('normalizes section plans against reader sections and available agents', () => {
    const readingSections: ReaderReadingSection[] = [
      { id: 'section_1', title: '第一节', start: 0, end: 10 },
      { id: 'section_2', title: '第二节', start: 10, end: 20 },
    ];
    const sections: FocusCoReadingSectionPlan[] = [
      {
        sectionId: 'section_1',
        sectionTitle: '旧标题',
        sectionStart: 2,
        sectionEnd: 8,
        agentIds: ['agent_1', 'missing', 'agent_1'],
        messages: [
          {
            id: 'message_1',
            content: '只给林知微',
            agentId: 'agent_1',
            agentIds: ['agent_1', 'missing'],
            agentNicknames: ['林知微', '不存在'],
            createdAt: '2026-05-16T00:00:00.000Z',
          },
        ],
      },
    ];

    expect(normalizeFocusSectionPlans(sections, readingSections, agents)).toEqual([
      {
        sectionId: 'section_1',
        sectionTitle: '第一节',
        sectionStart: 0,
        sectionEnd: 10,
        summary: undefined,
        tag: undefined,
        targetDensity: undefined,
        needsFurtherPlanning: undefined,
        agentIds: ['agent_1'],
        messages: [
          {
            id: 'message_1',
            content: '只给林知微',
            agentId: 'agent_1',
            agentUsername: undefined,
            agentNickname: '林知微',
            agentIds: ['agent_1'],
            agentUsernames: [],
            agentNicknames: ['林知微'],
            createdAt: '2026-05-16T00:00:00.000Z',
          },
        ],
      },
      {
        sectionId: 'section_2',
        sectionTitle: '第二节',
        sectionStart: 10,
        sectionEnd: 20,
        summary: undefined,
        tag: undefined,
        targetDensity: undefined,
        needsFurtherPlanning: undefined,
        agentIds: [],
        messages: [],
      },
    ]);
  });

  it('filters message targets to allowed agents', () => {
    const message: FocusCoReadingMessage = {
      id: 'message_1',
      content: '多目标留言',
      agentIds: ['agent_1', 'agent_2', 'agent_3'],
      agentUsernames: ['agent_1', 'agent_2', 'agent_3'],
      agentNicknames: ['林知微', '周砚', '旧助手'],
      createdAt: '2026-05-16T00:00:00.000Z',
    };

    expect(filterFocusMessageTargetsForAgents(message, new Set(['agent_2']))).toEqual([
      {
        ...message,
        agentId: 'agent_2',
        agentUsername: 'agent_2',
        agentNickname: '周砚',
        agentIds: ['agent_2'],
        agentUsernames: ['agent_2'],
        agentNicknames: ['周砚'],
      },
    ]);
    expect(filterFocusMessageTargetsForAgents(message, new Set(['missing']))).toEqual([]);
  });

  it('builds reading plan items for the selected agent', () => {
    const section: FocusCoReadingSectionPlan = {
      sectionId: 'section_1',
      sectionTitle: '第一节',
      sectionStart: 0,
      sectionEnd: 10,
      summary: '读这一节',
      tag: '关键',
      targetDensity: 'high',
      agentIds: ['agent_1', 'agent_2'],
      messages: [
        { id: 'global', content: '所有人都看', createdAt: '2026-05-16T00:00:00.000Z' },
        {
          id: 'agent_1_only',
          content: '只给林知微',
          agentId: 'agent_1',
          createdAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'agent_2_only',
          content: '只给周砚',
          agentId: 'agent_2',
          createdAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    };

    expect(
      focusSectionToReadingPlanItem(section, agents[0]!).messages?.map((item) => item.content),
    ).toEqual(['所有人都看', '只给林知微']);
  });
});
