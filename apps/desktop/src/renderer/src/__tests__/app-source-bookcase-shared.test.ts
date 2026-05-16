import { describe, expect, it } from 'vitest';
import type { Annotation, PublicAgent } from '@yomitomo/shared';
import { agentInstructionFromNote, targetAnchorReadingPlan } from '../app-source-bookcase-shared';

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
