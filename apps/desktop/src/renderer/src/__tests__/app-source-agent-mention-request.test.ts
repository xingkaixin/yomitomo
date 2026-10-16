import { describe, expect, it } from 'vitest';
import type { PublicAgent } from '@yomitomo/shared';
import { agentInstructionFromNote } from '../source/bookcase/app-source-agent-mention-request';

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
