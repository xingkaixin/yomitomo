import { describe, expect, it } from 'vitest';
import type { Agent } from '@yomitomo/shared';
import {
  publicAnnotationAgents,
  publicReviewAgents,
} from '../source/bookcase/source-public-agents';

function desktopAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_desktop',
    kind: 'annotation',
    presetId: 'lin',
    enabled: true,
    providerId: 'provider_1',
    nickname: 'lin',
    username: 'lin',
    avatar: '',
    annotationColor: '#8a8f4f',
    annotationDensity: 'medium',
    temperature: 0.4,
    soul: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('publicAnnotationAgents', () => {
  it('filters disabled annotation agents by default', () => {
    const enabled = desktopAgent({ id: 'agent_enabled', username: 'enabled', enabled: true });
    const disabled = desktopAgent({ id: 'agent_disabled', username: 'disabled', enabled: false });

    expect(publicAnnotationAgents([enabled, disabled]).map((item) => item.username)).toEqual([
      'enabled',
    ]);
    expect(
      publicAnnotationAgents([enabled, disabled], undefined, { includeDisabled: true }).map(
        (item) => item.username,
      ),
    ).toEqual(['enabled', 'disabled']);
  });

  it('uses locale persona assets instead of the stored legacy avatar', () => {
    const agents: Agent[] = [
      desktopAgent({
        id: 'agent_reading_partner',
        presetId: 'reading-partner',
        nickname: '林知微',
        username: '林知微',
        avatar: 'zh-legacy-avatar',
        soul: 'legacy soul',
      }),
    ];

    const [publicAgent] = publicAnnotationAgents(agents, 'en');

    expect(publicAgent.nickname).toBe('June Hartley');
    expect(publicAgent.username).toBe('JuneHartley');
    expect(publicAgent.avatar).toContain('/agent-personas/en/annotation/reading-partner.webp');
    expect(publicAgent.avatar).not.toBe('zh-legacy-avatar');
  });
});

describe('publicReviewAgents', () => {
  it('filters disabled review agents', () => {
    const enabled = desktopAgent({
      id: 'review_enabled',
      kind: 'review',
      username: 'review-enabled',
      enabled: true,
    });
    const disabled = desktopAgent({
      id: 'review_disabled',
      kind: 'review',
      username: 'review-disabled',
      enabled: false,
    });

    expect(publicReviewAgents([enabled, disabled]).map((item) => item.username)).toEqual([
      'review-enabled',
    ]);
  });
});
